import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNotNull, isNull, like, or, sql, type SQL } from "drizzle-orm";
import { AuthzError, type CurrentUser } from "../auth/session";
import { getDb, type Db } from "../db/client";
import {
  auditLog, bibleTranslation, contentItem, contentTranslation, eventDetail, mediaAsset, ministryDetail, sermonDetail,
  staffRole, testimonyDetail, user, verseDetail, verseSchedule, verseText,
  type ContentLocale, type ContentStatus, type ContentType, type MediaType, type StaffRole, type TestimonyPermission,
} from "../db/schema";
import { can, type Permission } from "../policy/permissions";
import { audit, type AuditAction } from "../services/audit";
import { grantRole, revokeRole } from "../services/roles";
import { canPerform, publishBlocker, STATUS_AFTER, type ContentAction } from "./rules";
import type { ContentInput, DetailInput, TranslationInput } from "./schemas";
import { invalidatePublicContent } from "./cache";

/**
 * CMS services. Every function takes the signed-in staff member (from requirePermission /
 * getCurrentUser on the server) and checks permissions itself, so the rules hold no matter which
 * route, action or script calls it. Client-supplied ids are lookup keys only.
 *
 * Audit rows hold ids, action names and status changes only: never titles, names or text,
 * because testimonies and ministry contacts may contain personal details.
 */

export interface Ctx {
  actor: CurrentUser;
  ip?: string | null;
}

export class CmsError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "CONFLICT" | "SLUG_TAKEN" | "NOT_ALLOWED_IN_STATE" | "INVALID",
    message: string,
    readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

async function authorize(ctx: Ctx, permission: Permission) {
  if (!can(ctx.actor.principal, permission)) {
    await audit({ actorUserId: ctx.actor.userId, action: "policy.deny", outcome: "DENIED", entity: "permission", reason: permission, ip: ctx.ip });
    throw new AuthzError(403);
  }
}

async function denyAction(ctx: Ctx, entity: string, id: string, action: string): Promise<never> {
  await audit({ actorUserId: ctx.actor.userId, action: "policy.deny", outcome: "DENIED", entity, entityId: id, reason: `content.${action}`, ip: ctx.ip });
  throw new AuthzError(403);
}

const isDuplicate = (e: unknown) => {
  const err = e as { code?: string; errno?: number; cause?: { code?: string } };
  return err?.code === "ER_DUP_ENTRY" || err?.errno === 1062 || err?.cause?.code === "ER_DUP_ENTRY";
};

const entityOf = (type: ContentType) => type.toLowerCase();

// ── Reading for the editor ────────────────────────────────────────────────

export interface EditableItem {
  id: string;
  type: ContentType;
  status: ContentStatus;
  slug: string;
  visibility: "PUBLIC" | "UNLISTED";
  featured: boolean;
  publishAt: Date | null;
  expiresAt: Date | null;
  publishedAt: Date | null;
  firstPublishedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  translations: Record<ContentLocale, TranslationInput>;
  detail: Record<string, unknown> | null;
  testimonyPermission: TestimonyPermission | null;
}

const emptyTranslation = (): TranslationInput => ({ title: "", summary: "", bodyMd: "", seoTitle: "", seoDescription: "", state: "EMPTY" });

export async function getItemForEdit(ctx: Ctx, id: string): Promise<EditableItem> {
  await authorize(ctx, "admin.access");
  const db = getDb();
  const [item] = await db.select().from(contentItem).where(eq(contentItem.id, id));
  if (!item) throw new CmsError("NOT_FOUND", "This item does not exist.");
  if (item.deletedAt && !can(ctx.actor.principal, "content.publish")) throw new CmsError("NOT_FOUND", "This item does not exist.");
  const rows = await db.select().from(contentTranslation).where(eq(contentTranslation.itemId, id));
  const translations = { ta: emptyTranslation(), en: emptyTranslation() };
  for (const r of rows) translations[r.locale] = { title: r.title, summary: r.summary, bodyMd: r.bodyMd, seoTitle: r.seoTitle, seoDescription: r.seoDescription, state: r.state };
  const { detail, testimonyPermission } = await loadDetail(db, item.type, id);
  return {
    id: item.id, type: item.type, status: item.status, slug: item.slug ?? "", visibility: item.visibility, featured: item.featured,
    publishAt: item.publishAt, expiresAt: item.expiresAt, publishedAt: item.publishedAt, firstPublishedAt: item.firstPublishedAt,
    version: item.version, createdAt: item.createdAt, updatedAt: item.updatedAt, deletedAt: item.deletedAt,
    translations, detail, testimonyPermission,
  };
}

async function loadDetail(db: Db | Tx, type: ContentType, id: string): Promise<{ detail: Record<string, unknown> | null; testimonyPermission: TestimonyPermission | null }> {
  switch (type) {
    case "EVENT": {
      const [d] = await db.select().from(eventDetail).where(eq(eventDetail.itemId, id));
      return { detail: d ? { startsAt: d.startsAt, endsAt: d.endsAt, locationKind: d.locationKind, locationText: d.locationText } : null, testimonyPermission: null };
    }
    case "SERMON": {
      const [d] = await db.select().from(sermonDetail).where(eq(sermonDetail.itemId, id));
      return { detail: d ? { speaker: d.speaker, bibleReference: d.bibleReference, sermonDate: d.sermonDate ?? "", videoUrl: d.videoUrl, thumbnailAssetId: d.thumbnailAssetId } : null, testimonyPermission: null };
    }
    case "MINISTRY": {
      const [d] = await db.select().from(ministryDetail).where(eq(ministryDetail.itemId, id));
      return { detail: d ? { imageAssetId: d.imageAssetId, contactText: d.contactText, contactApproved: d.contactApproved } : null, testimonyPermission: null };
    }
    case "TESTIMONY": {
      const [d] = await db.select().from(testimonyDetail).where(eq(testimonyDetail.itemId, id));
      return { detail: d ? { authorDisplayName: d.authorDisplayName, anonymous: d.anonymous } : null, testimonyPermission: d?.permissionStatus ?? "NOT_RECORDED" };
    }
    case "VERSE": {
      const [d] = await db.select().from(verseDetail).where(eq(verseDetail.itemId, id));
      const texts = await db.select().from(verseText).where(eq(verseText.itemId, id));
      const ta = texts.find((t) => t.translationId === "bsi-ta");
      const en = texts.find((t) => t.translationId === "nkjv-en");
      return {
        detail: { cardVariant: d?.cardVariant ?? "compact", preset: d?.preset ?? "vaigarai", referenceTa: ta?.reference ?? "", textTa: ta?.text ?? "", referenceEn: en?.reference ?? "", textEn: en?.text ?? "" },
        testimonyPermission: null,
      };
    }
    default:
      return { detail: null, testimonyPermission: null };
  }
}

// ── Writing ───────────────────────────────────────────────────────────────

async function writeTranslations(tx: Tx, id: string, input: ContentInput, now: Date) {
  for (const locale of ["ta", "en"] as const) {
    const t = input[locale];
    const state = t.title || t.bodyMd || t.summary ? (t.state === "EMPTY" ? "DRAFT" : t.state) : "EMPTY";
    const values = { title: t.title, summary: t.summary, bodyMd: t.bodyMd, seoTitle: t.seoTitle, seoDescription: t.seoDescription, state, updatedAt: now } as const;
    await tx.insert(contentTranslation).values({ itemId: id, locale, ...values }).onDuplicateKeyUpdate({ set: values });
  }
}

async function writeDetail(tx: Tx, ctx: Ctx, type: ContentType, id: string, detail: Record<string, unknown> | null) {
  if (!detail) return;
  switch (type) {
    case "EVENT": {
      const d = detail as DetailInput<"EVENT">;
      const v = { startsAt: d.startsAt!, endsAt: d.endsAt, locationKind: d.locationKind, locationText: d.locationText };
      await tx.insert(eventDetail).values({ itemId: id, ...v }).onDuplicateKeyUpdate({ set: v });
      return;
    }
    case "SERMON": {
      const d = detail as DetailInput<"SERMON">;
      await assertAssets(tx, [d.thumbnailAssetId]);
      const v = { speaker: d.speaker, bibleReference: d.bibleReference, sermonDate: d.sermonDate || null, videoUrl: d.videoUrl, thumbnailAssetId: d.thumbnailAssetId };
      await tx.insert(sermonDetail).values({ itemId: id, ...v }).onDuplicateKeyUpdate({ set: v });
      return;
    }
    case "MINISTRY": {
      const d = detail as DetailInput<"MINISTRY">;
      await assertAssets(tx, [d.imageAssetId]);
      const [existing] = await tx.select({ approved: ministryDetail.contactApproved, text: ministryDetail.contactText }).from(ministryDetail).where(eq(ministryDetail.itemId, id));
      // Only a Church Admin approves a public contact line; any change to the text withdraws approval.
      const approved = can(ctx.actor.principal, "content.publish") ? d.contactApproved : Boolean(existing?.approved && existing.text === d.contactText);
      const v = { imageAssetId: d.imageAssetId, contactText: d.contactText, contactApproved: d.contactText ? approved : false };
      await tx.insert(ministryDetail).values({ itemId: id, ...v }).onDuplicateKeyUpdate({ set: v });
      return;
    }
    case "TESTIMONY": {
      const d = detail as DetailInput<"TESTIMONY">;
      const v = { authorDisplayName: d.authorDisplayName, anonymous: d.anonymous };
      await tx.insert(testimonyDetail).values({ itemId: id, ...v }).onDuplicateKeyUpdate({ set: v });
      return;
    }
    case "VERSE": {
      const d = detail as DetailInput<"VERSE">;
      const v = { cardVariant: d.cardVariant, preset: d.preset };
      await tx.insert(verseDetail).values({ itemId: id, ...v }).onDuplicateKeyUpdate({ set: v });
      for (const [translationId, reference, text] of [["bsi-ta", d.referenceTa, d.textTa], ["nkjv-en", d.referenceEn, d.textEn]] as const) {
        await tx.insert(verseText).values({ itemId: id, translationId, reference, text }).onDuplicateKeyUpdate({ set: { reference, text } });
      }
      return;
    }
  }
}

async function assertAssets(tx: Tx, ids: (string | null)[]) {
  const wanted = ids.filter((x): x is string => Boolean(x));
  if (!wanted.length) return;
  const found = await tx.select({ id: mediaAsset.id }).from(mediaAsset).where(and(inArray(mediaAsset.id, wanted), isNull(mediaAsset.deletedAt)));
  if (found.length !== wanted.length) throw new CmsError("INVALID", "The chosen image no longer exists.");
}

export async function createItem(ctx: Ctx, type: ContentType, input: ContentInput): Promise<{ id: string; version: number }> {
  await authorize(ctx, "content.draft.edit");
  const id = randomUUID();
  const now = new Date();
  try {
    await getDb().transaction(async (tx) => {
      await tx.insert(contentItem).values({
        id, type, status: "DRAFT", slug: input.slug || null, visibility: input.visibility, featured: input.featured,
        publishAt: input.publishAt, expiresAt: input.expiresAt, version: 1,
        createdByUserId: ctx.actor.userId, updatedByUserId: ctx.actor.userId, createdAt: now, updatedAt: now,
      });
      await writeTranslations(tx, id, input, now);
      await writeDetail(tx, ctx, type, id, input.detail);
      await audit({ actorUserId: ctx.actor.userId, action: "content.create", entity: entityOf(type), entityId: id, ip: ctx.ip }, { db: tx });
    });
  } catch (e) {
    if (isDuplicate(e)) throw new CmsError("SLUG_TAKEN", "That address is already used.", { slug: "That address is already used by another item." });
    throw e;
  }
  return { id, version: 1 };
}

export async function updateItem(ctx: Ctx, id: string, expectedVersion: number, input: ContentInput): Promise<{ version: number }> {
  await authorize(ctx, "content.draft.edit");
  const now = new Date();
  try {
    return await getDb().transaction(async (tx) => {
      const [item] = await tx.select().from(contentItem).where(eq(contentItem.id, id)).for("update");
      if (!item || item.deletedAt) throw new CmsError("NOT_FOUND", "This item does not exist.");
      const testimony = item.type === "TESTIMONY" ? (await loadDetail(tx, "TESTIMONY", id)).testimonyPermission : null;
      if (!canPerform(ctx.actor.principal, { type: item.type, status: item.status, deleted: false, testimonyPermission: testimony }, "edit")) {
        return denyAction(ctx, entityOf(item.type), id, "edit");
      }
      if (item.version !== expectedVersion) throw new CmsError("CONFLICT", "Someone else saved this item after you opened it. Reload to see their changes, then edit again.");
      await tx
        .update(contentItem)
        .set({
          slug: input.slug || null, visibility: input.visibility, featured: input.featured, publishAt: input.publishAt, expiresAt: input.expiresAt,
          version: item.version + 1, updatedByUserId: ctx.actor.userId, updatedAt: now,
        })
        .where(and(eq(contentItem.id, id), eq(contentItem.version, expectedVersion)));
      await writeTranslations(tx, id, input, now);
      await writeDetail(tx, ctx, item.type, id, input.detail);
      await audit({ actorUserId: ctx.actor.userId, action: "content.update", entity: entityOf(item.type), entityId: id, reason: item.status, ip: ctx.ip }, { db: tx });
      if (item.status === "PUBLISHED") invalidatePublicContent();
      return { version: item.version + 1 };
    });
  } catch (e) {
    if (isDuplicate(e)) throw new CmsError("SLUG_TAKEN", "That address is already used.", { slug: "That address is already used by another item." });
    throw e;
  }
}

const ACTION_AUDIT: Record<ContentAction, AuditAction> = {
  edit: "content.update",
  submit: "content.submit",
  publish: "content.publish",
  unpublish: "content.unpublish",
  archive: "content.archive",
  return_to_draft: "content.return_to_draft",
  delete: "content.delete",
  restore: "content.restore",
};

/** Workflow transitions. Publishing-side actions write a required audit row in the same transaction. */
export async function transition(ctx: Ctx, id: string, action: Exclude<ContentAction, "edit">): Promise<ContentStatus> {
  await authorize(ctx, "admin.access");
  const now = new Date();
  const result = await getDb().transaction(async (tx) => {
    const [item] = await tx.select().from(contentItem).where(eq(contentItem.id, id)).for("update");
    if (!item) throw new CmsError("NOT_FOUND", "This item does not exist.");
    const testimony = item.type === "TESTIMONY" ? (await loadDetail(tx, "TESTIMONY", id)).testimonyPermission : null;
    const state = { type: item.type, status: item.status, deleted: Boolean(item.deletedAt), testimonyPermission: testimony };
    if (!canPerform(ctx.actor.principal, state, action)) {
      if (action === "publish" && can(ctx.actor.principal, "content.publish")) {
        const blocker = publishBlocker(state);
        if (blocker) throw new CmsError("NOT_ALLOWED_IN_STATE", blocker);
      }
      if (can(ctx.actor.principal, "content.publish") || (action === "submit" && can(ctx.actor.principal, "content.submit_for_review"))) {
        throw new CmsError("NOT_ALLOWED_IN_STATE", "That action is not available for this item in its current state.");
      }
      return denyAction(ctx, entityOf(item.type), id, action);
    }
    const base = { version: item.version + 1, updatedByUserId: ctx.actor.userId, updatedAt: now };
    let next: ContentStatus = item.status;
    if (action === "delete") {
      await tx.update(contentItem).set({ ...base, deletedAt: now, deletedByUserId: ctx.actor.userId }).where(eq(contentItem.id, id));
    } else {
      next = STATUS_AFTER[action];
      await tx
        .update(contentItem)
        .set({
          ...base,
          status: next,
          ...(action === "restore" ? { deletedAt: null, deletedByUserId: null } : {}),
          ...(action === "submit" ? { submittedAt: now } : {}),
          ...(action === "publish" ? { publishedAt: now, firstPublishedAt: item.firstPublishedAt ?? now } : {}),
        })
        .where(eq(contentItem.id, id));
    }
    const required = action !== "submit";
    await audit({ actorUserId: ctx.actor.userId, action: ACTION_AUDIT[action], entity: entityOf(item.type), entityId: id, reason: `${item.status}->${action === "delete" ? "DELETED" : next}`, ip: ctx.ip }, { db: tx, required });
    return { next, touchesPublic: item.status === "PUBLISHED" || next === "PUBLISHED" };
  });
  if (result.touchesPublic) invalidatePublicContent();
  return result.next;
}

// ── Lists and dashboard ──────────────────────────────────────────────────

export interface ListRow {
  id: string;
  type: ContentType;
  status: ContentStatus;
  titleTa: string;
  titleEn: string;
  slug: string | null;
  featured: boolean;
  publishAt: Date | null;
  expiresAt: Date | null;
  updatedAt: Date;
  deletedAt: Date | null;
  startsAt: Date | null;
  testimonyPermission: TestimonyPermission | null;
}

export async function listItems(
  ctx: Ctx,
  type: ContentType | null,
  opts: { status?: ContentStatus | "DELETED" | null; q?: string; limit?: number } = {},
): Promise<ListRow[]> {
  await authorize(ctx, "admin.access");
  const db = getDb();
  const ta = sql<string>`(SELECT ct.title FROM content_translation ct WHERE ct.item_id = ${contentItem.id} AND ct.locale = 'ta')`;
  const en = sql<string>`(SELECT ct.title FROM content_translation ct WHERE ct.item_id = ${contentItem.id} AND ct.locale = 'en')`;
  const where: SQL[] = [];
  if (type) where.push(eq(contentItem.type, type));
  if (opts.status === "DELETED") {
    if (!can(ctx.actor.principal, "content.publish")) return [];
    where.push(isNotNull(contentItem.deletedAt));
  } else {
    where.push(isNull(contentItem.deletedAt));
    if (opts.status) where.push(eq(contentItem.status, opts.status));
  }
  const q = opts.q?.normalize("NFC").trim();
  if (q) {
    const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const titleMatch = sql`EXISTS (SELECT 1 FROM content_translation ct WHERE ct.item_id = ${contentItem.id} AND ct.title LIKE ${pattern})`;
    // Slugs are ascii_bin: compare only ASCII queries with them (Tamil would be a collation error).
    where.push(/^[\x00-\x7f]+$/.test(q) ? or(titleMatch, like(contentItem.slug, pattern.toLowerCase()))! : titleMatch);
  }
  const rows = await db
    .select({
      id: contentItem.id, type: contentItem.type, status: contentItem.status, titleTa: ta, titleEn: en, slug: contentItem.slug,
      featured: contentItem.featured, publishAt: contentItem.publishAt, expiresAt: contentItem.expiresAt, updatedAt: contentItem.updatedAt,
      deletedAt: contentItem.deletedAt, startsAt: eventDetail.startsAt, testimonyPermission: testimonyDetail.permissionStatus,
    })
    .from(contentItem)
    .leftJoin(eventDetail, eq(eventDetail.itemId, contentItem.id))
    .leftJoin(testimonyDetail, eq(testimonyDetail.itemId, contentItem.id))
    .where(and(...where))
    .orderBy(desc(contentItem.updatedAt))
    .limit(Math.min(opts.limit ?? 200, 500));
  return rows.map((r) => ({ ...r, titleTa: r.titleTa ?? "", titleEn: r.titleEn ?? "" }));
}

export interface DashboardData {
  counts: Record<ContentType, Record<ContentStatus, number>>;
  totals: { published: number; draft: number; inReview: number; scheduled: number };
  recentContent: ListRow[];
  upcomingSpecial: ListRow[];
  adminActivity: { id: number; action: string; outcome: string; entity: string | null; entityId: string | null; reason: string | null; actorName: string | null; createdAt: Date }[] | null;
}

export async function dashboard(ctx: Ctx, now = new Date()): Promise<DashboardData> {
  await authorize(ctx, "admin.access");
  const db = getDb();
  const grouped = await db
    .select({ type: contentItem.type, status: contentItem.status, n: sql<number>`COUNT(*)` })
    .from(contentItem)
    .where(isNull(contentItem.deletedAt))
    .groupBy(contentItem.type, contentItem.status);
  const [scheduled] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(contentItem)
    .where(and(isNull(contentItem.deletedAt), eq(contentItem.status, "PUBLISHED"), sql`${contentItem.publishAt} > ${now}`));
  const counts = {} as DashboardData["counts"];
  const totals = { published: 0, draft: 0, inReview: 0, scheduled: Number(scheduled?.n ?? 0) };
  for (const g of grouped) {
    counts[g.type] ??= { DRAFT: 0, IN_REVIEW: 0, PUBLISHED: 0, ARCHIVED: 0 };
    counts[g.type][g.status] = Number(g.n);
    if (g.status === "PUBLISHED") totals.published += Number(g.n);
    if (g.status === "DRAFT") totals.draft += Number(g.n);
    if (g.status === "IN_REVIEW") totals.inReview += Number(g.n);
  }
  totals.published -= totals.scheduled;
  const recentContent = await listItems(ctx, null, { limit: 8 });
  const upcomingSpecial = (await listItems(ctx, "EVENT", { limit: 200 }))
    .filter((r) => r.startsAt && r.startsAt.getTime() >= now.getTime() && r.status !== "ARCHIVED")
    .sort((a, b) => a.startsAt!.getTime() - b.startsAt!.getTime())
    .slice(0, 5);
  let adminActivity: DashboardData["adminActivity"] = null;
  if (can(ctx.actor.principal, "audit.read")) adminActivity = await recentAudit(10);
  return { counts, totals, recentContent, upcomingSpecial, adminActivity };
}

async function recentAudit(limit: number, actionPrefix?: string) {
  const db = getDb();
  return db
    .select({ id: auditLog.id, action: auditLog.action, outcome: auditLog.outcome, entity: auditLog.entity, entityId: auditLog.entityId, reason: auditLog.reason, actorName: user.name, createdAt: auditLog.createdAt })
    .from(auditLog)
    .leftJoin(user, eq(user.id, auditLog.actorUserId))
    .where(actionPrefix ? like(auditLog.action, `${actionPrefix.replace(/[\\%_]/g, (c) => `\\${c}`)}%`) : undefined)
    .orderBy(desc(auditLog.id))
    .limit(limit);
}

export async function listAudit(ctx: Ctx, opts: { actionPrefix?: string; limit?: number } = {}) {
  await authorize(ctx, "audit.read");
  return recentAudit(Math.min(opts.limit ?? 100, 500), opts.actionPrefix || undefined);
}

// ── Testimony permission, Bible permissions, verse schedule ──────────────

export async function recordTestimonyPermission(ctx: Ctx, id: string, status: TestimonyPermission) {
  await authorize(ctx, "content.publish");
  const now = new Date();
  await getDb().transaction(async (tx) => {
    const [item] = await tx.select().from(contentItem).where(and(eq(contentItem.id, id), eq(contentItem.type, "TESTIMONY"), isNull(contentItem.deletedAt))).for("update");
    if (!item) throw new CmsError("NOT_FOUND", "This testimony does not exist.");
    const v = { permissionStatus: status, permissionRecordedAt: now, permissionRecordedByUserId: ctx.actor.userId };
    await tx.insert(testimonyDetail).values({ itemId: id, ...v }).onDuplicateKeyUpdate({ set: v });
    // Withdrawn permission takes the testimony off the site immediately.
    const unpublish = status !== "GRANTED" && item.status === "PUBLISHED";
    await tx.update(contentItem).set({ version: item.version + 1, updatedAt: now, updatedByUserId: ctx.actor.userId, ...(unpublish ? { status: "DRAFT" as const } : {}) }).where(eq(contentItem.id, id));
    await audit({ actorUserId: ctx.actor.userId, action: "testimony.permission", entity: "testimony", entityId: id, reason: status + (unpublish ? " (unpublished)" : ""), ip: ctx.ip }, { db: tx, required: true });
  });
  invalidatePublicContent();
}

export async function listTranslations() {
  return getDb().select().from(bibleTranslation).orderBy(bibleTranslation.locale);
}

export async function setTranslationPermission(
  ctx: Ctx,
  input: { translationId: "bsi-ta" | "nkjv-en"; verified: boolean; downloadsAllowed: boolean; creditLine: string; permissionReference: string },
) {
  await authorize(ctx, "content.publish");
  if (input.verified && (!input.creditLine || !input.permissionReference)) {
    throw new CmsError("INVALID", "Add the exact credit line and where the permission is documented before marking it verified.", {
      ...(input.creditLine ? {} : { creditLine: "Required when permission is verified." }),
      ...(input.permissionReference ? {} : { permissionReference: "Required when permission is verified." }),
    });
  }
  const now = new Date();
  await getDb().transaction(async (tx) => {
    await tx
      .update(bibleTranslation)
      .set({
        creditLine: input.creditLine,
        permissionReference: input.permissionReference,
        permissionStatus: input.verified ? "VERIFIED" : "NOT_VERIFIED",
        permissionVerifiedAt: input.verified ? now : null,
        permissionVerifiedByUserId: input.verified ? ctx.actor.userId : null,
        downloadsAllowed: input.verified && input.downloadsAllowed,
        updatedAt: now,
      })
      .where(eq(bibleTranslation.id, input.translationId));
    await audit(
      { actorUserId: ctx.actor.userId, action: "bible.permission", entity: "bible_translation", entityId: input.translationId, reason: `${input.verified ? "VERIFIED" : "NOT_VERIFIED"}; downloads ${input.verified && input.downloadsAllowed ? "on" : "off"}`, ip: ctx.ip },
      { db: tx, required: true },
    );
  });
  invalidatePublicContent();
}

export async function scheduleVerse(ctx: Ctx, dateKey: string, itemId: string | null) {
  await authorize(ctx, "content.publish");
  await getDb().transaction(async (tx) => {
    if (itemId) {
      const [v] = await tx.select({ id: contentItem.id }).from(contentItem).where(and(eq(contentItem.id, itemId), eq(contentItem.type, "VERSE"), isNull(contentItem.deletedAt)));
      if (!v) throw new CmsError("NOT_FOUND", "Choose an existing verse.");
      const row = { itemId, scheduledByUserId: ctx.actor.userId, createdAt: new Date() };
      await tx.insert(verseSchedule).values({ dateKey, ...row }).onDuplicateKeyUpdate({ set: row });
    } else {
      await tx.delete(verseSchedule).where(eq(verseSchedule.dateKey, dateKey));
    }
    await audit({ actorUserId: ctx.actor.userId, action: "verse.schedule", entity: "verse_schedule", entityId: dateKey, reason: itemId ? "set" : "cleared", ip: ctx.ip }, { db: tx, required: true });
  });
  invalidatePublicContent();
}

export async function listVerseSchedule(ctx: Ctx, fromDateKey: string) {
  await authorize(ctx, "admin.access");
  return getDb()
    .select({ dateKey: verseSchedule.dateKey, itemId: verseSchedule.itemId })
    .from(verseSchedule)
    .where(sql`${verseSchedule.dateKey} >= ${fromDateKey}`)
    .orderBy(verseSchedule.dateKey)
    .limit(60);
}

// ── Media ─────────────────────────────────────────────────────────────────

export const MEDIA_MAX_BYTES = 2 * 1024 * 1024;

/** Identifies JPEG, PNG and WebP by their first bytes; everything else (SVG, HTML, PDF…) is refused. */
export function sniffImage(bytes: Uint8Array): MediaType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return "image/png";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

export async function uploadMedia(ctx: Ctx, file: { bytes: Uint8Array }, alt: { ta: string; en: string }) {
  await authorize(ctx, "media.upload");
  if (file.bytes.length === 0) throw new CmsError("INVALID", "Choose an image to upload.", { file: "Choose an image to upload." });
  if (file.bytes.length > MEDIA_MAX_BYTES) throw new CmsError("INVALID", "Images must be 2 MB or smaller.", { file: "Images must be 2 MB or smaller." });
  const mimeType = sniffImage(file.bytes);
  if (!mimeType) throw new CmsError("INVALID", "Only JPEG, PNG or WebP images can be uploaded.", { file: "Only JPEG, PNG or WebP images can be uploaded." });
  const id = randomUUID();
  const sha256 = createHash("sha256").update(file.bytes).digest("hex");
  await getDb().transaction(async (tx) => {
    await tx.insert(mediaAsset).values({ id, mimeType, byteSize: file.bytes.length, sha256, altTa: alt.ta, altEn: alt.en, data: Buffer.from(file.bytes), createdByUserId: ctx.actor.userId, createdAt: new Date() });
    await audit({ actorUserId: ctx.actor.userId, action: "media.upload", entity: "media", entityId: id, reason: mimeType, ip: ctx.ip }, { db: tx });
  });
  return { id, mimeType };
}

export async function listMedia(ctx: Ctx) {
  await authorize(ctx, "admin.access");
  return getDb()
    .select({ id: mediaAsset.id, mimeType: mediaAsset.mimeType, byteSize: mediaAsset.byteSize, altTa: mediaAsset.altTa, altEn: mediaAsset.altEn, createdAt: mediaAsset.createdAt })
    .from(mediaAsset)
    .where(isNull(mediaAsset.deletedAt))
    .orderBy(desc(mediaAsset.createdAt))
    .limit(200);
}

/** Staff-only image bytes for previews. Public serving arrives with the public pages (later phase). */
export async function getMediaForStaff(ctx: Ctx, id: string) {
  await authorize(ctx, "admin.access");
  const [row] = await getDb().select({ data: mediaAsset.data, mimeType: mediaAsset.mimeType, sha256: mediaAsset.sha256 }).from(mediaAsset).where(and(eq(mediaAsset.id, id), isNull(mediaAsset.deletedAt)));
  return row ?? null;
}

export async function deleteMedia(ctx: Ctx, id: string) {
  await authorize(ctx, "content.publish");
  await getDb().transaction(async (tx) => {
    const res = await tx.update(mediaAsset).set({ deletedAt: new Date() }).where(and(eq(mediaAsset.id, id), isNull(mediaAsset.deletedAt)));
    if (!res[0].affectedRows) throw new CmsError("NOT_FOUND", "This image does not exist.");
    await tx.update(sermonDetail).set({ thumbnailAssetId: null }).where(eq(sermonDetail.thumbnailAssetId, id));
    await tx.update(ministryDetail).set({ imageAssetId: null }).where(eq(ministryDetail.imageAssetId, id));
    await audit({ actorUserId: ctx.actor.userId, action: "media.delete", entity: "media", entityId: id, ip: ctx.ip }, { db: tx, required: true });
  });
  invalidatePublicContent();
}

// ── Staff (Church Admin) ──────────────────────────────────────────────────

export async function listStaff(ctx: Ctx) {
  await authorize(ctx, "staff.manage");
  const rows = await getDb()
    .select({ userId: user.id, name: user.name, email: user.email, role: staffRole.role, grantedAt: staffRole.grantedAt })
    .from(staffRole)
    .innerJoin(user, eq(user.id, staffRole.userId))
    .orderBy(user.name);
  const byUser = new Map<string, { userId: string; name: string; email: string; roles: StaffRole[] }>();
  for (const r of rows) {
    const entry = byUser.get(r.userId) ?? { userId: r.userId, name: r.name, email: r.email, roles: [] };
    entry.roles.push(r.role);
    byUser.set(r.userId, entry);
  }
  return [...byUser.values()];
}

export async function grantRoleByEmail(ctx: Ctx, email: string, role: StaffRole) {
  await authorize(ctx, "staff.manage");
  const [target] = await getDb().select({ id: user.id }).from(user).where(eq(user.email, email.trim()));
  if (!target) throw new CmsError("NOT_FOUND", "No verified account uses that email. The person must sign up and verify their email first.");
  await grantRole(ctx.actor.userId, target.id, role, ctx.ip);
}

export async function revokeRoleFor(ctx: Ctx, targetUserId: string, role: StaffRole) {
  await authorize(ctx, "staff.manage");
  await revokeRole(ctx.actor.userId, targetUserId, role, ctx.ip);
}
