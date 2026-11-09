import "server-only";
import { randomUUID } from "node:crypto";
import { and, count, desc, eq, gt } from "drizzle-orm";
import { getDb } from "../db/client";
import { contactMessage, prayerRequest, testimonySubmission, type ContactStatus, type PrayerStatus } from "../db/schema";
import { sendStaffNotification } from "../email/send";
import { log } from "../security/log";
import { audit } from "../services/audit";
import { can, type Permission } from "../policy/permissions";
import { CmsError, createItem, recordTestimonyPermission, type Ctx } from "../cms/service";
import { parseContentForm } from "../cms/schemas";
import { AuthzError } from "../auth/session";
import { dataKeyConfigured, decryptText, encryptText } from "./crypto";
import { checkFormToken, contentHash, DUPLICATE_WINDOW_MS, HONEYPOT_FIELD, TOKEN_FIELD, withinCeilings, type FormName } from "./protection";
import { displayNameFor, parseContact, parsePrayer, parseTestimony, type FieldErrors } from "./validation";
import { renderNotification } from "./notify";

/**
 * Public forms and the staff inboxes (website completion, Nov 2026). The only module that reads or
 * writes prayer_request, contact_message and testimony_submission (a unit test enforces this).
 *
 * Feature switch: NLTAG_PUBLIC_FORMS=1, set only where migration 0004 has been applied (staging
 * now; production after the owner approves the migration). Prayer requests also need
 * NLTAG_DATA_KEY (encryption at rest). Without them the forms say "not available yet" and the
 * inboxes return 404: nothing is collected that nobody can read.
 */
export const CONSENT_VERSION = { prayer: "p-2026-11", testimony: "t-2026-11" } as const;

export function publicFormsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return (env.NLTAG_PUBLIC_FORMS ?? "").trim() === "1";
}
export function formAvailable(form: FormName, env: Record<string, string | undefined> = process.env): boolean {
  if (!publicFormsEnabled(env)) return false;
  return form === "prayer" ? dataKeyConfigured(env) : true;
}

export type SubmitResult =
  | { kind: "received" }
  | { kind: "invalid"; errors: FieldErrors }
  | { kind: "expired" }
  | { kind: "busy" }
  | { kind: "unavailable" };

const RECEIVED: SubmitResult = { kind: "received" };

/** Steps shared by every form: availability, honeypot, token, validation, ceilings, duplicates. */
async function gate(form: FormName, f: FormData, now: number): Promise<SubmitResult | null> {
  if (!formAvailable(form)) return { kind: "unavailable" };
  if (typeof f.get(HONEYPOT_FIELD) === "string" && (f.get(HONEYPOT_FIELD) as string).trim() !== "") {
    await audit({ action: "form.refused", outcome: "DENIED", entity: form, reason: "honeypot" });
    return RECEIVED; // a bot: same answer, nothing stored
  }
  const token = checkFormToken(form, f.get(TOKEN_FIELD), now);
  if (token === "invalid" || token === "too-fast") {
    await audit({ action: "form.refused", outcome: "DENIED", entity: form, reason: `token:${token}` });
    return RECEIVED;
  }
  if (token === "expired") return { kind: "expired" };
  return null;
}

async function isDuplicate(table: typeof prayerRequest | typeof contactMessage | typeof testimonySubmission, hash: string, now: number) {
  const [row] = await getDb()
    .select({ n: count() })
    .from(table)
    .where(and(eq(table.contentHash, hash), gt(table.createdAt, new Date(now - DUPLICATE_WINDOW_MS))));
  return Number(row?.n ?? 0) > 0;
}

function inbox(): string | null {
  const v = (process.env.NLTAG_CHURCH_INBOX ?? "").trim();
  return v || null;
}

/** Notification after the row is committed; a failed email never loses the submission. */
const pendingNotifications = new Set<Promise<unknown>>();
function notifyInBackground(form: FormName, id: string, mark: () => Promise<unknown>, extra: Record<string, string> = {}) {
  const to = inbox();
  if (!to) return;
  const p = (async () => {
    const outcome = await sendStaffNotification(`notify.${form}`, to, renderNotification(form, id, extra));
    if (outcome === "sent") await mark();
    else await audit({ action: "form.notify_failed", outcome: "FAILURE", entity: form, entityId: id, reason: outcome });
  })().catch((error) => log("error", "form.notify_failed", { form, error }));
  pendingNotifications.add(p);
  void p.finally(() => pendingNotifications.delete(p));
}
export async function flushFormNotificationsForTests() {
  while (pendingNotifications.size) await Promise.all([...pendingNotifications]);
}

// ── Public submissions ─────────────────────────────────────────────────────────────────────────

export async function submitPrayer(locale: "ta" | "en", f: FormData, now = Date.now()): Promise<SubmitResult> {
  const early = await gate("prayer", f, now);
  if (early) return early;
  const parsed = parsePrayer(f);
  if (!parsed.ok) return { kind: "invalid", errors: parsed.errors };
  const d = parsed.data;
  const hash = contentHash("prayer", [d.body]);
  if (await isDuplicate(prayerRequest, hash, now)) return RECEIVED;
  if (!(await withinCeilings("prayer", now))) {
    await audit({ action: "form.refused", outcome: "DENIED", entity: "prayer", reason: "ceiling" });
    return { kind: "busy" };
  }
  const id = randomUUID();
  await getDb().insert(prayerRequest).values({
    id, createdAt: new Date(now), locale, nameEnc: encryptText(d.name), contactEnc: encryptText(d.contact), bodyEnc: encryptText(d.body),
    contactRequested: d.contactRequested, consentVersion: CONSENT_VERSION.prayer, contentHash: hash,
  });
  await audit({ action: "prayer.received", entity: "prayer", entityId: id });
  notifyInBackground("prayer", id, () => getDb().update(prayerRequest).set({ notifiedAt: new Date() }).where(eq(prayerRequest.id, id)));
  return RECEIVED;
}

export async function submitContact(locale: "ta" | "en", f: FormData, now = Date.now()): Promise<SubmitResult> {
  const early = await gate("contact", f, now);
  if (early) return early;
  const parsed = parseContact(f);
  if (!parsed.ok) return { kind: "invalid", errors: parsed.errors };
  const d = parsed.data;
  const hash = contentHash("contact", [d.email, d.subject, d.message]);
  if (await isDuplicate(contactMessage, hash, now)) return RECEIVED;
  if (!(await withinCeilings("contact", now))) {
    await audit({ action: "form.refused", outcome: "DENIED", entity: "contact", reason: "ceiling" });
    return { kind: "busy" };
  }
  const id = randomUUID();
  await getDb().insert(contactMessage).values({ id, createdAt: new Date(now), locale, ...d, contentHash: hash });
  await audit({ action: "contact.received", entity: "contact", entityId: id });
  notifyInBackground("contact", id, () => getDb().update(contactMessage).set({ notifiedAt: new Date() }).where(eq(contactMessage.id, id)), {
    name: d.name, email: d.email, phone: d.phone, subject: d.subject, message: d.message,
  });
  return RECEIVED;
}

export async function submitTestimony(locale: "ta" | "en", f: FormData, now = Date.now()): Promise<SubmitResult> {
  const early = await gate("testimony", f, now);
  if (early) return early;
  const parsed = parseTestimony(f);
  if (!parsed.ok) return { kind: "invalid", errors: parsed.errors };
  const d = parsed.data;
  const hash = contentHash("testimony", [d.title, d.body]);
  if (await isDuplicate(testimonySubmission, hash, now)) return RECEIVED;
  if (!(await withinCeilings("testimony", now))) {
    await audit({ action: "form.refused", outcome: "DENIED", entity: "testimony", reason: "ceiling" });
    return { kind: "busy" };
  }
  const id = randomUUID();
  await getDb().insert(testimonySubmission).values({
    id, createdAt: new Date(now), locale, title: d.title, body: d.body, display: d.display, name: d.name,
    contact: d.contact, consentVersion: CONSENT_VERSION.testimony, contentHash: hash,
  });
  await audit({ action: "testimony_submission.received", entity: "testimony_submission", entityId: id });
  notifyInBackground("testimony", id, () => getDb().update(testimonySubmission).set({ notifiedAt: new Date() }).where(eq(testimonySubmission.id, id)));
  return RECEIVED;
}

// ── Staff inboxes ──────────────────────────────────────────────────────────────────────────────

export const INBOX_PAGE_SIZE = 25;

async function authorize(ctx: Ctx, permission: Permission) {
  if (!publicFormsEnabled()) throw new CmsError("NOT_FOUND", "This inbox is not available.");
  if (!can(ctx.actor.principal, permission)) {
    await audit({ actorUserId: ctx.actor.userId, action: "policy.deny", outcome: "DENIED", entity: "permission", reason: permission, ip: ctx.ip });
    throw new AuthzError(403, "forbidden");
  }
}

const pageOf = (page: number) => Math.max(1, Math.floor(page) || 1);

// Prayer (Church Admin, Prayer Team)

export async function listPrayer(ctx: Ctx, opts: { status?: PrayerStatus | ""; page?: number } = {}) {
  await authorize(ctx, "prayer.read");
  const where = opts.status ? eq(prayerRequest.status, opts.status) : undefined;
  const page = pageOf(opts.page ?? 1);
  const db = getDb();
  const [total] = await db.select({ n: count() }).from(prayerRequest).where(where);
  // The list never decrypts: no names or text in the list (opening one is audited).
  const rows = await db
    .select({ id: prayerRequest.id, createdAt: prayerRequest.createdAt, locale: prayerRequest.locale, status: prayerRequest.status, contactRequested: prayerRequest.contactRequested, notifiedAt: prayerRequest.notifiedAt })
    .from(prayerRequest)
    .where(where)
    .orderBy(desc(prayerRequest.createdAt))
    .limit(INBOX_PAGE_SIZE)
    .offset((page - 1) * INBOX_PAGE_SIZE);
  return { rows, total: Number(total?.n ?? 0), page, pageSize: INBOX_PAGE_SIZE };
}

export async function getPrayer(ctx: Ctx, id: string) {
  await authorize(ctx, "prayer.read");
  const [row] = await getDb().select().from(prayerRequest).where(eq(prayerRequest.id, id));
  if (!row) throw new CmsError("NOT_FOUND", "This prayer request does not exist.");
  await audit({ actorUserId: ctx.actor.userId, action: "prayer.viewed", entity: "prayer", entityId: id, ip: ctx.ip });
  return {
    id: row.id, createdAt: row.createdAt, locale: row.locale, status: row.status, contactRequested: row.contactRequested, notifiedAt: row.notifiedAt,
    name: decryptText(row.nameEnc), contact: decryptText(row.contactEnc), body: decryptText(row.bodyEnc),
  };
}

export async function setPrayerStatus(ctx: Ctx, id: string, status: PrayerStatus) {
  await authorize(ctx, "prayer.manage");
  const [r] = (await getDb().update(prayerRequest).set({ status, statusChangedAt: new Date(), statusChangedByUserId: ctx.actor.userId }).where(eq(prayerRequest.id, id))) as unknown as [{ affectedRows: number }];
  if (!r.affectedRows) throw new CmsError("NOT_FOUND", "This prayer request does not exist.");
  await audit({ actorUserId: ctx.actor.userId, action: "prayer.status_changed", entity: "prayer", entityId: id, reason: status, ip: ctx.ip });
}

/** Real delete (owner decision: kept until manually deleted). The audit keeps the id only. */
export async function deletePrayer(ctx: Ctx, id: string) {
  await authorize(ctx, "prayer.delete");
  const [r] = (await getDb().delete(prayerRequest).where(eq(prayerRequest.id, id))) as unknown as [{ affectedRows: number }];
  if (!r.affectedRows) throw new CmsError("NOT_FOUND", "This prayer request does not exist.");
  await audit({ actorUserId: ctx.actor.userId, action: "prayer.deleted", entity: "prayer", entityId: id, ip: ctx.ip });
}

// Contact (Church Admin)

export async function listContact(ctx: Ctx, opts: { status?: ContactStatus | ""; page?: number } = {}) {
  await authorize(ctx, "contact.read");
  const where = opts.status ? eq(contactMessage.status, opts.status) : undefined;
  const page = pageOf(opts.page ?? 1);
  const db = getDb();
  const [total] = await db.select({ n: count() }).from(contactMessage).where(where);
  const rows = await db
    .select({ id: contactMessage.id, createdAt: contactMessage.createdAt, locale: contactMessage.locale, status: contactMessage.status, name: contactMessage.name, subject: contactMessage.subject, notifiedAt: contactMessage.notifiedAt })
    .from(contactMessage)
    .where(where)
    .orderBy(desc(contactMessage.createdAt))
    .limit(INBOX_PAGE_SIZE)
    .offset((page - 1) * INBOX_PAGE_SIZE);
  return { rows, total: Number(total?.n ?? 0), page, pageSize: INBOX_PAGE_SIZE };
}

export async function getContact(ctx: Ctx, id: string) {
  await authorize(ctx, "contact.read");
  const [row] = await getDb().select().from(contactMessage).where(eq(contactMessage.id, id));
  if (!row) throw new CmsError("NOT_FOUND", "This message does not exist.");
  await audit({ actorUserId: ctx.actor.userId, action: "contact.viewed", entity: "contact", entityId: id, ip: ctx.ip });
  return row;
}

export async function setContactStatus(ctx: Ctx, id: string, status: ContactStatus) {
  await authorize(ctx, "contact.manage");
  const [r] = (await getDb().update(contactMessage).set({ status, handledAt: new Date(), handledByUserId: ctx.actor.userId }).where(eq(contactMessage.id, id))) as unknown as [{ affectedRows: number }];
  if (!r.affectedRows) throw new CmsError("NOT_FOUND", "This message does not exist.");
  await audit({ actorUserId: ctx.actor.userId, action: "contact.status_changed", entity: "contact", entityId: id, reason: status, ip: ctx.ip });
}

export async function deleteContact(ctx: Ctx, id: string) {
  await authorize(ctx, "contact.manage");
  const [r] = (await getDb().delete(contactMessage).where(eq(contactMessage.id, id))) as unknown as [{ affectedRows: number }];
  if (!r.affectedRows) throw new CmsError("NOT_FOUND", "This message does not exist.");
  await audit({ actorUserId: ctx.actor.userId, action: "contact.deleted", entity: "contact", entityId: id, ip: ctx.ip });
}

// Testimony submissions (Church Admin; Content Editors without the submitter's contact details)

export async function listTestimonySubmissions(ctx: Ctx, opts: { status?: (typeof testimonySubmission.$inferSelect)["status"] | ""; page?: number } = {}) {
  await authorize(ctx, "submission.read");
  const where = opts.status ? eq(testimonySubmission.status, opts.status) : undefined;
  const page = pageOf(opts.page ?? 1);
  const db = getDb();
  const [total] = await db.select({ n: count() }).from(testimonySubmission).where(where);
  const rows = await db
    .select({ id: testimonySubmission.id, createdAt: testimonySubmission.createdAt, locale: testimonySubmission.locale, status: testimonySubmission.status, title: testimonySubmission.title, display: testimonySubmission.display })
    .from(testimonySubmission)
    .where(where)
    .orderBy(desc(testimonySubmission.createdAt))
    .limit(INBOX_PAGE_SIZE)
    .offset((page - 1) * INBOX_PAGE_SIZE);
  return { rows, total: Number(total?.n ?? 0), page, pageSize: INBOX_PAGE_SIZE };
}

export async function getTestimonySubmission(ctx: Ctx, id: string) {
  await authorize(ctx, "submission.read");
  const [row] = await getDb().select().from(testimonySubmission).where(eq(testimonySubmission.id, id));
  if (!row) throw new CmsError("NOT_FOUND", "This submission does not exist.");
  await audit({ actorUserId: ctx.actor.userId, action: "testimony_submission.viewed", entity: "testimony_submission", entityId: id, ip: ctx.ip });
  const showContact = can(ctx.actor.principal, "submission.contact");
  return { ...row, contact: showContact ? row.contact : null, contentHash: undefined };
}

/**
 * "Accept as draft": creates a TESTIMONY draft (never published here) in the submission's language
 * with the submitter's chosen display name. A Church Admin's acceptance also records the
 * permission as Granted (the submitter's consent, version stored on the submission); a Content
 * Editor's leaves it Not recorded for the Church Admin. Publishing stays the normal workflow.
 */
export async function acceptTestimonySubmission(ctx: Ctx, id: string): Promise<{ contentItemId: string }> {
  await authorize(ctx, "submission.decide");
  const [row] = await getDb().select().from(testimonySubmission).where(eq(testimonySubmission.id, id));
  if (!row) throw new CmsError("NOT_FOUND", "This submission does not exist.");
  if (row.status !== "NEW") throw new CmsError("NOT_ALLOWED_IN_STATE", "This submission has already been decided.");
  const display = displayNameFor(row.display, row.name);
  const f = new FormData();
  f.set(`${row.locale}.title`, row.title);
  f.set(`${row.locale}.bodyMd`, row.body);
  f.set("detail.authorDisplayName", display);
  if (!display) f.set("detail.anonymous", "on");
  const parsed = parseContentForm("TESTIMONY", f);
  if (!parsed.ok) throw new CmsError("INVALID", "The submission text could not be turned into a draft. Copy it into a new testimony by hand.");
  const { id: itemId } = await createItem(ctx, "TESTIMONY", parsed.data);
  if (can(ctx.actor.principal, "content.publish")) await recordTestimonyPermission(ctx, itemId, "GRANTED");
  await getDb().update(testimonySubmission).set({ status: "ACCEPTED", contentItemId: itemId, decidedAt: new Date(), decidedByUserId: ctx.actor.userId }).where(eq(testimonySubmission.id, id));
  await audit({ actorUserId: ctx.actor.userId, action: "testimony_submission.accepted", entity: "testimony_submission", entityId: id, reason: `draft ${itemId}`, ip: ctx.ip });
  return { contentItemId: itemId };
}

export async function setTestimonySubmissionStatus(ctx: Ctx, id: string, status: "REJECTED" | "ARCHIVED") {
  await authorize(ctx, "submission.decide");
  const [r] = (await getDb().update(testimonySubmission).set({ status, decidedAt: new Date(), decidedByUserId: ctx.actor.userId }).where(eq(testimonySubmission.id, id))) as unknown as [{ affectedRows: number }];
  if (!r.affectedRows) throw new CmsError("NOT_FOUND", "This submission does not exist.");
  await audit({ actorUserId: ctx.actor.userId, action: "testimony_submission.status_changed", entity: "testimony_submission", entityId: id, reason: status, ip: ctx.ip });
}

export async function deleteTestimonySubmission(ctx: Ctx, id: string) {
  await authorize(ctx, "submission.contact"); // Church Admin only
  const [r] = (await getDb().delete(testimonySubmission).where(eq(testimonySubmission.id, id))) as unknown as [{ affectedRows: number }];
  if (!r.affectedRows) throw new CmsError("NOT_FOUND", "This submission does not exist.");
  await audit({ actorUserId: ctx.actor.userId, action: "testimony_submission.deleted", entity: "testimony_submission", entityId: id, ip: ctx.ip });
}

/** Dashboard counts, only for the inboxes the person may open. */
export async function inboxCounts(ctx: Ctx) {
  if (!publicFormsEnabled()) return {};
  const db = getDb();
  const out: { prayer?: number; contact?: number; testimony?: number } = {};
  if (can(ctx.actor.principal, "prayer.read")) out.prayer = Number((await db.select({ n: count() }).from(prayerRequest).where(eq(prayerRequest.status, "NEW")))[0]?.n ?? 0);
  if (can(ctx.actor.principal, "contact.read")) out.contact = Number((await db.select({ n: count() }).from(contactMessage).where(eq(contactMessage.status, "NEW")))[0]?.n ?? 0);
  if (can(ctx.actor.principal, "submission.read")) out.testimony = Number((await db.select({ n: count() }).from(testimonySubmission).where(eq(testimonySubmission.status, "NEW")))[0]?.n ?? 0);
  return out;
}
