"use server";

import { redirect } from "next/navigation";
import { CONTENT_TYPES, STAFF_ROLES, TESTIMONY_PERMISSIONS, type ContentType, type StaffRole } from "@/server/db/schema";
import { moduleByType } from "@/server/cms/registry";
import { dateKeySchema, normalizeText, parseContentForm, translationPermissionSchema } from "@/server/cms/schemas";
import {
  createItem, deleteMedia, grantRoleByEmail, recordTestimonyPermission, revokeRoleFor, scheduleVerse, setTranslationPermission,
  transition, updateItem, uploadMedia,
} from "@/server/cms/service";
import type { ContentAction } from "@/server/cms/rules";
import { actionCtx, errorKey, errorState, type ActionState } from "./_lib/staff";

/**
 * Admin server actions. Next.js checks the Origin of every server action (CSRF). Each action
 * re-resolves the signed-in user from the session and lets the service enforce permissions;
 * nothing from the form (ids, roles, status) is trusted beyond being a lookup key.
 */

const SIGNED_OUT: Omit<ActionState, "seq"> = { ok: false, message: "Your session has ended. Sign in again." };
const isType = (v: unknown): v is ContentType => typeof v === "string" && (CONTENT_TYPES as readonly string[]).includes(v);
const str = (fd: FormData, k: string) => (typeof fd.get(k) === "string" ? String(fd.get(k)) : "");

export async function saveContentAction(prev: ActionState, fd: FormData): Promise<ActionState> {
  const seq = prev.seq + 1;
  const ctx = await actionCtx();
  if (!ctx) return { ...SIGNED_OUT, seq };
  const type = fd.get("type");
  if (!isType(type)) return { ok: false, seq, message: "Unknown content type." };
  const parsed = parseContentForm(type, fd);
  if (!parsed.ok) {
    const n = Object.keys(parsed.errors).length;
    return { ok: false, seq, message: `${n} ${n === 1 ? "field needs" : "fields need"} attention. Nothing was saved.`, errors: parsed.errors };
  }
  const id = str(fd, "id");
  let createdId: string | null = null;
  try {
    if (!id) {
      createdId = (await createItem(ctx, type, parsed.data)).id;
    } else {
      const version = Number(str(fd, "version"));
      const r = await updateItem(ctx, id, version, parsed.data);
      return { ok: true, seq, message: "Saved.", version: r.version };
    }
  } catch (e) {
    return errorState(e, seq);
  }
  redirect(`/admin/${moduleByType(type).segment}/${createdId}?done=created`);
}

const WORKFLOW: readonly Exclude<ContentAction, "edit">[] = ["submit", "publish", "unpublish", "archive", "return_to_draft", "delete", "restore"];

export async function workflowAction(fd: FormData) {
  const ctx = await actionCtx();
  const id = str(fd, "id");
  const type = fd.get("type");
  const action = str(fd, "action") as Exclude<ContentAction, "edit">;
  if (!ctx || !isType(type) || !WORKFLOW.includes(action)) redirect("/admin");
  const segment = moduleByType(type).segment;
  let target = `/admin/${segment}/${id}?done=${action}`;
  try {
    await transition(ctx, id, action);
    if (action === "delete") target = `/admin/${segment}?done=deleted`;
  } catch (e) {
    target = `/admin/${segment}/${id}?error=${errorKey(e)}`;
  }
  redirect(target);
}

export async function testimonyPermissionAction(fd: FormData) {
  const ctx = await actionCtx();
  const id = str(fd, "id");
  const status = TESTIMONY_PERMISSIONS.find((s) => s === str(fd, "permission"));
  if (!ctx || !status) redirect("/admin");
  let target = `/admin/testimonies/${id}?done=permission`;
  try {
    await recordTestimonyPermission(ctx, id, status);
  } catch (e) {
    target = `/admin/testimonies/${id}?error=${errorKey(e)}`;
  }
  redirect(target);
}

export async function translationPermissionAction(prev: ActionState, fd: FormData): Promise<ActionState> {
  const seq = prev.seq + 1;
  const ctx = await actionCtx();
  if (!ctx) return { ...SIGNED_OUT, seq };
  const parsed = translationPermissionSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, seq, message: parsed.error.issues[0]?.message ?? "Check the form." };
  try {
    await setTranslationPermission(ctx, parsed.data);
    return { ok: true, seq, message: parsed.data.verified ? "Permission recorded as verified." : "Saved. Verse text stays private." };
  } catch (e) {
    return errorState(e, seq);
  }
}

export async function scheduleVerseAction(prev: ActionState, fd: FormData): Promise<ActionState> {
  const seq = prev.seq + 1;
  const ctx = await actionCtx();
  if (!ctx) return { ...SIGNED_OUT, seq };
  const date = dateKeySchema.safeParse(str(fd, "dateKey"));
  if (!date.success) return { ok: false, seq, message: "Choose a date.", errors: { dateKey: "Choose a date." } };
  try {
    await scheduleVerse(ctx, date.data, str(fd, "itemId") || null);
    return { ok: true, seq, message: str(fd, "itemId") ? `Verse scheduled for ${date.data}.` : `Schedule cleared for ${date.data}.` };
  } catch (e) {
    return errorState(e, seq);
  }
}

export async function uploadMediaAction(prev: ActionState, fd: FormData): Promise<ActionState> {
  const seq = prev.seq + 1;
  const ctx = await actionCtx();
  if (!ctx) return { ...SIGNED_OUT, seq };
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, seq, message: "Choose an image to upload.", errors: { file: "Choose an image to upload." } };
  const altEn = normalizeText(fd.get("altEn")).slice(0, 300);
  const altTa = normalizeText(fd.get("altTa")).slice(0, 300);
  if (/<[a-z!/?]/i.test(altEn + altTa)) return { ok: false, seq, message: "HTML is not allowed in descriptions." };
  try {
    await uploadMedia(ctx, { bytes: new Uint8Array(await file.arrayBuffer()) }, { ta: altTa, en: altEn });
    return { ok: true, seq, message: "Image uploaded." };
  } catch (e) {
    return errorState(e, seq);
  }
}

export async function deleteMediaAction(fd: FormData) {
  const ctx = await actionCtx();
  if (!ctx) redirect("/admin");
  let target = "/admin/media?done=deleted";
  try {
    await deleteMedia(ctx, str(fd, "id"));
  } catch (e) {
    target = `/admin/media?error=${errorKey(e)}`;
  }
  redirect(target);
}

const isRole = (v: string): v is StaffRole => (STAFF_ROLES as readonly string[]).includes(v);

export async function grantRoleAction(prev: ActionState, fd: FormData): Promise<ActionState> {
  const seq = prev.seq + 1;
  const ctx = await actionCtx();
  if (!ctx) return { ...SIGNED_OUT, seq };
  const email = normalizeText(fd.get("email"));
  const role = str(fd, "role");
  if (!email || !isRole(role)) return { ok: false, seq, message: "Enter the person's email and choose a role.", errors: { email: "Enter the email of a verified account." } };
  try {
    await grantRoleByEmail(ctx, email, role);
    return { ok: true, seq, message: "Role granted." };
  } catch (e) {
    return errorState(e, seq);
  }
}

export async function revokeRoleAction(fd: FormData) {
  const ctx = await actionCtx();
  const role = str(fd, "role");
  if (!ctx || !isRole(role)) redirect("/admin");
  let target = "/admin/staff?done=revoked";
  try {
    await revokeRoleFor(ctx, str(fd, "userId"), role);
  } catch (e) {
    target = `/admin/staff?error=${errorKey(e)}`;
  }
  redirect(target);
}
