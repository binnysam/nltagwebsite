import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "../db/client";
import { galleryPhoto, mediaAsset, type PhotoPermission } from "../db/schema";
import { audit } from "../services/audit";
import { can, type Permission } from "../policy/permissions";
import { CmsError, type Ctx } from "../cms/service";
import { AuthzError } from "../auth/session";
import { publicFormsEnabled } from "../forms/service";
import { discardVariantFiles, readMediaFile, readVariantFile, VARIANT_WIDTHS, writeVariantFile, type VariantWidth } from "../storage/media-store";
import { log } from "../security/log";

/**
 * Public image gallery (website completion, Nov 2026; migration 0004).
 *
 * Rules:
 *  - Any staff member who may upload media (Content Editor, Church Admin) adds library images to
 *    the gallery as drafts and edits captions.
 *  - Only a Church Admin records the photo permission (where consent is documented) and publishes.
 *    Publishing requires permission GRANTED. Withdrawing permission unpublishes at once.
 *  - On publish, resized WebP copies (480/960/1600 px) are made from the verified original with
 *    every metadata block dropped (EXIF, GPS, camera, ICC beyond sRGB). The original is never
 *    served publicly; /gallery-image/{photoId}/{width} serves only these copies, and only while the
 *    photo is published, permitted and its library image is not deleted. Otherwise 404.
 *  - Files live in the environment's media folder (staging: its own verified folder).
 * Shares the NLTAG_PUBLIC_FORMS switch (both need migration 0004).
 */
export const GALLERY_PAGE_SIZE = 24;

async function authorize(ctx: Ctx, permission: Permission) {
  if (!publicFormsEnabled()) throw new CmsError("NOT_FOUND", "The gallery is not available.");
  if (!can(ctx.actor.principal, permission)) {
    await audit({ actorUserId: ctx.actor.userId, action: "policy.deny", outcome: "DENIED", entity: "permission", reason: permission, ip: ctx.ip });
    throw new AuthzError(403, "forbidden");
  }
}

export async function listGalleryForStaff(ctx: Ctx, page = 1) {
  await authorize(ctx, "media.upload");
  const p = Math.max(1, Math.floor(page) || 1);
  const db = getDb();
  const [total] = await db.select({ n: count() }).from(galleryPhoto);
  const rows = await db
    .select({
      id: galleryPhoto.id, mediaAssetId: galleryPhoto.mediaAssetId, captionTa: galleryPhoto.captionTa, captionEn: galleryPhoto.captionEn, status: galleryPhoto.status,
      permission: galleryPhoto.permission, permissionNote: galleryPhoto.permissionNote, position: galleryPhoto.position, version: galleryPhoto.version, mediaDeleted: mediaAsset.deletedAt,
    })
    .from(galleryPhoto)
    .innerJoin(mediaAsset, eq(mediaAsset.id, galleryPhoto.mediaAssetId))
    .orderBy(asc(galleryPhoto.position), desc(galleryPhoto.createdAt))
    .limit(GALLERY_PAGE_SIZE)
    .offset((p - 1) * GALLERY_PAGE_SIZE);
  return { rows, total: Number(total?.n ?? 0), page: p, pageSize: GALLERY_PAGE_SIZE };
}

/** Library images not yet in the gallery (for the "Add to gallery" picker). */
export async function libraryImagesNotInGallery(ctx: Ctx) {
  await authorize(ctx, "media.upload");
  const db = getDb();
  const used = new Set((await db.select({ id: galleryPhoto.mediaAssetId }).from(galleryPhoto)).map((r) => r.id));
  const all = await db.select({ id: mediaAsset.id, altEn: mediaAsset.altEn, createdAt: mediaAsset.createdAt }).from(mediaAsset).where(isNull(mediaAsset.deletedAt)).orderBy(desc(mediaAsset.createdAt)).limit(200);
  return all.filter((m) => !used.has(m.id));
}

const cap = (s: string) => s.normalize("NFC").replace(/[\u0000-\u001F\u007F<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 300);

export async function addToGallery(ctx: Ctx, mediaAssetId: string, captions: { ta: string; en: string }) {
  await authorize(ctx, "media.upload");
  const db = getDb();
  const [m] = await db.select({ id: mediaAsset.id }).from(mediaAsset).where(and(eq(mediaAsset.id, mediaAssetId), isNull(mediaAsset.deletedAt)));
  if (!m) throw new CmsError("NOT_FOUND", "That image does not exist.");
  const [existing] = await db.select({ id: galleryPhoto.id }).from(galleryPhoto).where(eq(galleryPhoto.mediaAssetId, mediaAssetId));
  if (existing) throw new CmsError("INVALID", "That image is already in the gallery.");
  const id = randomUUID();
  const now = new Date();
  await db.insert(galleryPhoto).values({ id, mediaAssetId, captionTa: cap(captions.ta), captionEn: cap(captions.en), createdByUserId: ctx.actor.userId, createdAt: now, updatedAt: now });
  await audit({ actorUserId: ctx.actor.userId, action: "gallery.create", entity: "gallery_photo", entityId: id, ip: ctx.ip });
  return { id };
}

export async function updateGalleryCaptions(ctx: Ctx, id: string, captions: { ta: string; en: string }, position: number) {
  await authorize(ctx, "media.upload");
  const [r] = (await getDb()
    .update(galleryPhoto)
    .set({ captionTa: cap(captions.ta), captionEn: cap(captions.en), position: Math.max(-9999, Math.min(9999, Math.trunc(position) || 0)), updatedAt: new Date() })
    .where(eq(galleryPhoto.id, id))) as unknown as [{ affectedRows: number }];
  if (!r.affectedRows) throw new CmsError("NOT_FOUND", "That gallery photo does not exist.");
  await audit({ actorUserId: ctx.actor.userId, action: "gallery.update", entity: "gallery_photo", entityId: id, ip: ctx.ip });
}

export async function recordPhotoPermission(ctx: Ctx, id: string, permission: PhotoPermission, note: string) {
  await authorize(ctx, "gallery.publish");
  const db = getDb();
  const [row] = await db.select().from(galleryPhoto).where(eq(galleryPhoto.id, id));
  if (!row) throw new CmsError("NOT_FOUND", "That gallery photo does not exist.");
  if (permission === "GRANTED" && !cap(note)) throw new CmsError("INVALID", "Say where the permission is documented.", { permissionNote: "Required when permission is granted." });
  const unpublish = permission !== "GRANTED" && row.status === "PUBLISHED";
  await db
    .update(galleryPhoto)
    .set({ permission, permissionNote: cap(note), permissionRecordedAt: new Date(), permissionRecordedByUserId: ctx.actor.userId, updatedAt: new Date(), ...(unpublish ? { status: "DRAFT" as const } : {}) })
    .where(eq(galleryPhoto.id, id));
  await audit({ actorUserId: ctx.actor.userId, action: "gallery.permission", entity: "gallery_photo", entityId: id, reason: permission + (unpublish ? " (unpublished)" : ""), ip: ctx.ip });
}

/** Resized WebP copies with no metadata. Throws when the image library (sharp) is unavailable. */
export async function makeVariants(original: Buffer): Promise<{ width: number; height: number; files: { width: VariantWidth; bytes: Buffer }[] }> {
  const sharp = (await import("sharp")).default;
  const meta = await sharp(original, { failOn: "error" }).metadata();
  if (!meta.width || !meta.height) throw new Error("Unreadable image");
  const files: { width: VariantWidth; bytes: Buffer }[] = [];
  for (const w of VARIANT_WIDTHS) {
    // rotate() applies the EXIF orientation before the metadata is dropped (sharp drops all
    // metadata unless withMetadata() is called, which it never is here).
    const bytes = await sharp(original, { failOn: "error" }).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    files.push({ width: w, bytes });
  }
  const rotated = meta.orientation && meta.orientation >= 5;
  return { width: rotated ? meta.height : meta.width, height: rotated ? meta.width : meta.height, files };
}

export async function publishPhoto(ctx: Ctx, id: string) {
  await authorize(ctx, "gallery.publish");
  const db = getDb();
  const [row] = await db
    .select({ photo: galleryPhoto, storageKey: mediaAsset.storageKey, sha256: mediaAsset.sha256, deletedAt: mediaAsset.deletedAt })
    .from(galleryPhoto)
    .innerJoin(mediaAsset, eq(mediaAsset.id, galleryPhoto.mediaAssetId))
    .where(eq(galleryPhoto.id, id));
  if (!row || row.deletedAt) throw new CmsError("NOT_FOUND", "That gallery photo does not exist.");
  if (row.photo.permission !== "GRANTED") throw new CmsError("NOT_ALLOWED_IN_STATE", "Record the photo permission before publishing.");
  if (!row.photo.captionEn && !row.photo.captionTa) throw new CmsError("INVALID", "Add a caption in at least one language (it is also the image description for screen readers).");
  const original = await readMediaFile(row.storageKey, row.sha256);
  if (!original) throw new CmsError("INVALID", "The image file is missing or damaged. Upload it again.");
  let made;
  try {
    made = await makeVariants(original);
  } catch (error) {
    log("error", "gallery.variants_failed", { error });
    throw new CmsError("INVALID", "The image could not be prepared for the website. Nothing was published.");
  }
  const variants: Record<string, string> = {};
  for (const f of made.files) variants[String(f.width)] = await writeVariantFile(id, f.width, f.bytes);
  await db.update(galleryPhoto).set({ status: "PUBLISHED", variants: JSON.stringify(variants), width: made.width, height: made.height, publishedAt: new Date(), updatedAt: new Date(), version: row.photo.version + 1 }).where(eq(galleryPhoto.id, id));
  await audit({ actorUserId: ctx.actor.userId, action: "gallery.publish", entity: "gallery_photo", entityId: id, ip: ctx.ip });
}

export async function unpublishPhoto(ctx: Ctx, id: string) {
  await authorize(ctx, "gallery.publish");
  const [r] = (await getDb().update(galleryPhoto).set({ status: "DRAFT", updatedAt: new Date() }).where(eq(galleryPhoto.id, id))) as unknown as [{ affectedRows: number }];
  if (!r.affectedRows) throw new CmsError("NOT_FOUND", "That gallery photo does not exist.");
  await audit({ actorUserId: ctx.actor.userId, action: "gallery.unpublish", entity: "gallery_photo", entityId: id, ip: ctx.ip });
}

/** Removes the photo from the gallery and deletes its public copies. The library image stays. */
export async function removeFromGallery(ctx: Ctx, id: string) {
  await authorize(ctx, "gallery.publish");
  const [r] = (await getDb().delete(galleryPhoto).where(eq(galleryPhoto.id, id))) as unknown as [{ affectedRows: number }];
  if (!r.affectedRows) throw new CmsError("NOT_FOUND", "That gallery photo does not exist.");
  await discardVariantFiles(id);
  await audit({ actorUserId: ctx.actor.userId, action: "gallery.delete", entity: "gallery_photo", entityId: id, ip: ctx.ip });
}

// ── Public ─────────────────────────────────────────────────────────────────────────────────────

const publicWhere = () => and(eq(galleryPhoto.status, "PUBLISHED"), eq(galleryPhoto.permission, "GRANTED"), isNull(mediaAsset.deletedAt));

function variantMap(text: string | null): Record<string, string> {
  try {
    const v = JSON.parse(text ?? "{}") as unknown;
    return v && typeof v === "object" ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export interface PublicPhoto {
  id: string;
  caption: string;
  width: number;
  height: number;
  widths: VariantWidth[];
}

export async function listPublicGallery(locale: "ta" | "en", page = 1): Promise<{ photos: PublicPhoto[]; total: number; page: number; pageSize: number }> {
  if (!publicFormsEnabled()) return { photos: [], total: 0, page: 1, pageSize: GALLERY_PAGE_SIZE };
  const p = Math.max(1, Math.floor(page) || 1);
  const db = getDb();
  const [total] = await db.select({ n: count() }).from(galleryPhoto).innerJoin(mediaAsset, eq(mediaAsset.id, galleryPhoto.mediaAssetId)).where(publicWhere());
  const rows = await db
    .select({ id: galleryPhoto.id, captionTa: galleryPhoto.captionTa, captionEn: galleryPhoto.captionEn, width: galleryPhoto.width, height: galleryPhoto.height, variants: galleryPhoto.variants })
    .from(galleryPhoto)
    .innerJoin(mediaAsset, eq(mediaAsset.id, galleryPhoto.mediaAssetId))
    .where(publicWhere())
    .orderBy(asc(galleryPhoto.position), desc(galleryPhoto.publishedAt))
    .limit(GALLERY_PAGE_SIZE)
    .offset((p - 1) * GALLERY_PAGE_SIZE);
  const photos = rows.map((r) => ({
    id: r.id,
    caption: (locale === "ta" ? r.captionTa || r.captionEn : r.captionEn || r.captionTa) ?? "",
    width: r.width ?? 4,
    height: r.height ?? 3,
    widths: VARIANT_WIDTHS.filter((w) => variantMap(r.variants)[String(w)]),
  }));
  return { photos, total: Number(total?.n ?? 0), page: p, pageSize: GALLERY_PAGE_SIZE };
}

/** Bytes of one public copy, or null (404) unless published, permitted and intact. */
export async function publicVariant(id: string, width: number): Promise<Buffer | null> {
  if (!publicFormsEnabled()) return null;
  if (!(VARIANT_WIDTHS as readonly number[]).includes(width)) return null;
  const [row] = await getDb()
    .select({ variants: galleryPhoto.variants })
    .from(galleryPhoto)
    .innerJoin(mediaAsset, eq(mediaAsset.id, galleryPhoto.mediaAssetId))
    .where(and(eq(galleryPhoto.id, id), publicWhere()));
  const sha = row ? variantMap(row.variants)[String(width)] : undefined;
  if (!sha) return null;
  return readVariantFile(id, width as VariantWidth, sha);
}
