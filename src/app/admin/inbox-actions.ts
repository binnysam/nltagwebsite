"use server";

import { redirect } from "next/navigation";
import { CONTACT_STATUSES, PHOTO_PERMISSIONS, PRAYER_STATUSES, type ContactStatus, type PhotoPermission, type PrayerStatus } from "@/server/db/schema";
import {
  acceptTestimonySubmission, deleteContact, deletePrayer, deleteTestimonySubmission, setContactStatus, setPrayerStatus, setTestimonySubmissionStatus,
} from "@/server/forms/service";
import { addToGallery, publishPhoto, recordPhotoPermission, removeFromGallery, unpublishPhoto, updateGalleryCaptions } from "@/server/gallery/service";
import { actionCtx, errorKey } from "./_lib/staff";

/**
 * Inbox and gallery actions (Nov 2026). Same rules as actions.ts: Next.js checks the Origin
 * (CSRF), the session is resolved again here, the services check permissions, and form values are
 * lookup keys only. Results go back as fixed keys in the URL, never free text.
 */
const str = (fd: FormData, k: string) => (typeof fd.get(k) === "string" ? String(fd.get(k)) : "");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function run(base: string, okTarget: string, fn: (ctx: NonNullable<Awaited<ReturnType<typeof actionCtx>>>) => Promise<unknown>) {
  const ctx = await actionCtx();
  if (!ctx) redirect("/en/sign-in");
  let target = okTarget;
  try {
    await fn(ctx);
  } catch (e) {
    target = `${base}?error=${errorKey(e)}`;
  }
  redirect(target);
}

export async function prayerStatusAction(fd: FormData) {
  const id = str(fd, "id");
  const status = str(fd, "status") as PrayerStatus;
  if (!UUID.test(id) || !(PRAYER_STATUSES as readonly string[]).includes(status)) redirect("/admin/prayer?error=invalid");
  await run(`/admin/prayer/${id}`, `/admin/prayer/${id}?done=status`, (ctx) => setPrayerStatus(ctx, id, status));
}

export async function prayerDeleteAction(fd: FormData) {
  const id = str(fd, "id");
  if (!UUID.test(id)) redirect("/admin/prayer?error=invalid");
  await run(`/admin/prayer/${id}`, "/admin/prayer?done=removed", (ctx) => deletePrayer(ctx, id));
}

export async function contactStatusAction(fd: FormData) {
  const id = str(fd, "id");
  const status = str(fd, "status") as ContactStatus;
  if (!UUID.test(id) || !(CONTACT_STATUSES as readonly string[]).includes(status)) redirect("/admin/contact?error=invalid");
  await run(`/admin/contact/${id}`, `/admin/contact/${id}?done=status`, (ctx) => setContactStatus(ctx, id, status));
}

export async function contactDeleteAction(fd: FormData) {
  const id = str(fd, "id");
  if (!UUID.test(id)) redirect("/admin/contact?error=invalid");
  await run(`/admin/contact/${id}`, "/admin/contact?done=removed", (ctx) => deleteContact(ctx, id));
}

export async function submissionAcceptAction(fd: FormData) {
  const id = str(fd, "id");
  if (!UUID.test(id)) redirect("/admin/testimony-submissions?error=invalid");
  await run(`/admin/testimony-submissions/${id}`, `/admin/testimony-submissions/${id}?done=accepted`, (ctx) => acceptTestimonySubmission(ctx, id));
}

export async function submissionStatusAction(fd: FormData) {
  const id = str(fd, "id");
  const status = str(fd, "status");
  if (!UUID.test(id) || (status !== "REJECTED" && status !== "ARCHIVED")) redirect("/admin/testimony-submissions?error=invalid");
  await run(`/admin/testimony-submissions/${id}`, `/admin/testimony-submissions/${id}?done=status`, (ctx) => setTestimonySubmissionStatus(ctx, id, status as "REJECTED" | "ARCHIVED"));
}

export async function submissionDeleteAction(fd: FormData) {
  const id = str(fd, "id");
  if (!UUID.test(id)) redirect("/admin/testimony-submissions?error=invalid");
  await run(`/admin/testimony-submissions/${id}`, "/admin/testimony-submissions?done=removed", (ctx) => deleteTestimonySubmission(ctx, id));
}

export async function galleryAddAction(fd: FormData) {
  const mediaId = str(fd, "mediaAssetId");
  if (!UUID.test(mediaId)) redirect("/admin/gallery?error=invalid");
  await run("/admin/gallery", "/admin/gallery?done=added", (ctx) => addToGallery(ctx, mediaId, { ta: str(fd, "captionTa"), en: str(fd, "captionEn") }));
}

export async function galleryUpdateAction(fd: FormData) {
  const id = str(fd, "id");
  if (!UUID.test(id)) redirect("/admin/gallery?error=invalid");
  await run("/admin/gallery", "/admin/gallery?done=saved", (ctx) => updateGalleryCaptions(ctx, id, { ta: str(fd, "captionTa"), en: str(fd, "captionEn") }, Number(str(fd, "position"))));
}

export async function galleryPermissionAction(fd: FormData) {
  const id = str(fd, "id");
  const permission = str(fd, "permission") as PhotoPermission;
  if (!UUID.test(id) || !(PHOTO_PERMISSIONS as readonly string[]).includes(permission)) redirect("/admin/gallery?error=invalid");
  await run("/admin/gallery", "/admin/gallery?done=permission", (ctx) => recordPhotoPermission(ctx, id, permission, str(fd, "permissionNote")));
}

export async function galleryPublishAction(fd: FormData) {
  const id = str(fd, "id");
  const op = str(fd, "op");
  if (!UUID.test(id)) redirect("/admin/gallery?error=invalid");
  if (op === "publish") await run("/admin/gallery", "/admin/gallery?done=publish", (ctx) => publishPhoto(ctx, id));
  else if (op === "unpublish") await run("/admin/gallery", "/admin/gallery?done=unpublish", (ctx) => unpublishPhoto(ctx, id));
  else if (op === "remove") await run("/admin/gallery", "/admin/gallery?done=removed", (ctx) => removeFromGallery(ctx, id));
  else redirect("/admin/gallery?error=invalid");
}
