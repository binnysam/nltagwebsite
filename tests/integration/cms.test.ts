import { and, eq, sql } from "drizzle-orm";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthzError, getCurrentUser, type CurrentUser } from "@/server/auth/session";
import { closeDb, getDb } from "@/server/db/client";
import { auditLog, bibleTranslation, contentItem, contentTranslation, mediaAsset, staffRole, user } from "@/server/db/schema";
import { parseContentForm, type ContentInput } from "@/server/cms/schemas";
import {
  CmsError, createItem, dashboard, getItemForEdit, getMediaForStaff, grantRoleByEmail, listAudit, listItems, listStaff,
  recordTestimonyPermission, scheduleVerse, setTranslationPermission, transition, updateItem, uploadMedia,
} from "@/server/cms/service";
import {
  getDailyVerse, getPublishedPage, listPublished, listPublishedMinistries, listPublishedTestimonies, listUpcomingSpecialMeetings, queryPublishedRows,
} from "@/server/cms/public";
import { seed, SEED_PASSWORD, SEED_USERS } from "../../scripts/db/seed";
import { clearRateLimits, headersWith, signIn } from "./helpers";

/** Fictional test content only. Nothing here is church content or Scripture. */
const [ADMIN, EDITOR, MEMBER] = SEED_USERS.map((u) => u.email) as [string, string, string];
const actors: Record<string, CurrentUser> = {};
const ctx = (email: string) => ({ actor: actors[email]!, ip: "198.51.100.7" });

function input(type: Parameters<typeof parseContentForm>[0], fields: Record<string, string>): ContentInput {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  const r = parseContentForm(type, f);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.data;
}

beforeAll(async () => {
  await seed();
  await clearRateLimits();
  // Other test files change roles; start from the seed's roles regardless of file order.
  for (const u of SEED_USERS) {
    const [row] = await getDb().select({ id: user.id }).from(user).where(eq(user.email, u.email));
    await getDb().delete(staffRole).where(eq(staffRole.userId, row!.id));
    for (const role of u.roles) await getDb().insert(staffRole).values({ userId: row!.id, role, grantedByUserId: null, grantedAt: new Date() });
  }
  for (const email of [ADMIN, EDITOR, MEMBER]) {
    const { res, cookie } = await signIn(email, SEED_PASSWORD);
    expect(res.status).toBe(200);
    actors[email] = (await getCurrentUser(headersWith(cookie)))!;
  }
});
beforeEach(clearRateLimits);
afterAll(closeDb);

describe("migration 0001 (MariaDB)", () => {
  it("creates the CMS tables with the Tamil collation and leaves identity tables untouched", async () => {
    const [rows] = (await getDb().execute(sql`SELECT table_name AS t, table_collation AS c FROM information_schema.tables WHERE table_schema = DATABASE()`)) as unknown as [{ t: string; c: string }[]];
    const tables = Object.fromEntries(rows.map((r) => [r.t, r.c]));
    for (const t of ["content_item", "content_translation", "event_detail", "sermon_detail", "ministry_detail", "testimony_detail", "bible_translation", "verse_detail", "verse_text", "verse_schedule", "media_asset"]) {
      expect(tables[t], t).toBe("utf8mb4_uca1400_ai_ci");
    }
    for (const t of ["user", "session", "account", "verification", "staff_role", "audit_log"]) expect(tables[t]).toBeDefined();
  });

  it("seeds both Gate 0 translations without permission", async () => {
    const rows = await getDb().select().from(bibleTranslation);
    expect(rows.map((r) => [r.id, r.permissionStatus, r.downloadsAllowed, r.creditLine])).toEqual(
      expect.arrayContaining([["bsi-ta", "NOT_VERIFIED", false, ""], ["nkjv-en", "NOT_VERIFIED", false, ""]]),
    );
  });
});

describe("roles and isolation", () => {
  it("members cannot read or write CMS content, and denials are audited", async () => {
    await expect(createItem(ctx(MEMBER), "ANNOUNCEMENT", input("ANNOUNCEMENT", { "en.title": "Test" }))).rejects.toBeInstanceOf(AuthzError);
    await expect(listItems(ctx(MEMBER), null)).rejects.toMatchObject({ status: 403 });
    await expect(dashboard(ctx(MEMBER))).rejects.toMatchObject({ status: 403 });
    const denials = await getDb().select().from(auditLog).where(and(eq(auditLog.action, "policy.deny"), eq(auditLog.actorUserId, actors[MEMBER]!.userId)));
    expect(denials.length).toBeGreaterThanOrEqual(3);
  });

  it("editor drafts and submits, but cannot publish, delete, record permission or see audit and staff", async () => {
    const { id } = await createItem(ctx(EDITOR), "ANNOUNCEMENT", input("ANNOUNCEMENT", { "en.title": "Editor draft", "ta.title": "சோதனை வரைவு" }));
    await expect(transition(ctx(EDITOR), id, "publish")).rejects.toMatchObject({ status: 403 });
    await expect(transition(ctx(EDITOR), id, "delete")).rejects.toMatchObject({ status: 403 });
    expect(await transition(ctx(EDITOR), id, "submit")).toBe("IN_REVIEW");
    await expect(transition(ctx(EDITOR), id, "submit")).rejects.toBeInstanceOf(CmsError);
    await expect(listAudit(ctx(EDITOR))).rejects.toMatchObject({ status: 403 });
    await expect(listStaff(ctx(EDITOR))).rejects.toMatchObject({ status: 403 });
    await expect(grantRoleByEmail(ctx(EDITOR), MEMBER, "CHURCH_ADMIN")).rejects.toMatchObject({ status: 403 });
    await expect(setTranslationPermission(ctx(EDITOR), { translationId: "bsi-ta", verified: true, downloadsAllowed: true, creditLine: "x", permissionReference: "y" })).rejects.toMatchObject({ status: 403 });
    const dash = await dashboard(ctx(EDITOR));
    expect(dash.adminActivity).toBeNull();
  });

  it("editor cannot change published content; admin can", async () => {
    const { id } = await createItem(ctx(EDITOR), "ANNOUNCEMENT", input("ANNOUNCEMENT", { "en.title": "To publish" }));
    await transition(ctx(ADMIN), id, "publish");
    const item = await getItemForEdit(ctx(EDITOR), id);
    await expect(updateItem(ctx(EDITOR), id, item.version, input("ANNOUNCEMENT", { "en.title": "Changed by editor" }))).rejects.toMatchObject({ status: 403 });
    await expect(updateItem(ctx(ADMIN), id, item.version, input("ANNOUNCEMENT", { "en.title": "Changed by admin" }))).resolves.toEqual({ version: item.version + 1 });
  });

  it("rejects a stale save (optimistic concurrency)", async () => {
    const { id, version } = await createItem(ctx(EDITOR), "ANNOUNCEMENT", input("ANNOUNCEMENT", { "en.title": "Concurrent" }));
    await updateItem(ctx(EDITOR), id, version, input("ANNOUNCEMENT", { "en.title": "First save" }));
    await expect(updateItem(ctx(ADMIN), id, version, input("ANNOUNCEMENT", { "en.title": "Second save" }))).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("staff list and role grants are Church Admin only", async () => {
    const staff = await listStaff(ctx(ADMIN));
    expect(staff.map((s) => s.email)).toEqual(expect.arrayContaining([ADMIN, EDITOR]));
    expect(staff.map((s) => s.email)).not.toContain(MEMBER);
    await expect(grantRoleByEmail(ctx(ADMIN), "nobody@nltag.test", "CONTENT_EDITOR")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("draft and published visibility", () => {
  it("drafts, items in review, archived and deleted items never reach public queries", async () => {
    const make = async (title: string) => (await createItem(ctx(ADMIN), "PAGE", input("PAGE", { "en.title": title, slug: title.toLowerCase().replace(/\s+/g, "-") }))).id;
    const draft = await make("Vis Draft");
    const review = await make("Vis Review");
    await transition(ctx(EDITOR), review, "submit");
    const published = await make("Vis Published");
    await transition(ctx(ADMIN), published, "publish");
    const archived = await make("Vis Archived");
    await transition(ctx(ADMIN), archived, "publish");
    await transition(ctx(ADMIN), archived, "archive");
    const deleted = await make("Vis Deleted");
    await transition(ctx(ADMIN), deleted, "publish");
    await transition(ctx(ADMIN), deleted, "delete");

    const ids = (await listPublished("PAGE", "en")).map((p) => p.id);
    expect(ids).toContain(published);
    for (const hidden of [draft, review, archived, deleted]) expect(ids).not.toContain(hidden);
    expect(await getPublishedPage("vis-draft", "en")).toBeNull();
    expect((await getPublishedPage("vis-published", "en"))?.title).toBe("Vis Published");
    // English-only page has no Tamil version.
    expect(await getPublishedPage("vis-published", "ta")).toBeNull();
    // SQL and the pure rule agree: every row returned is PUBLISHED and not deleted.
    for (const r of await queryPublishedRows("PAGE")) {
      const [row] = await getDb().select().from(contentItem).where(eq(contentItem.id, r.id));
      expect([row!.status, row!.deletedAt]).toEqual(["PUBLISHED", null]);
    }
  });

  it("deleted items disappear from staff lists and can be restored by an admin", async () => {
    const { id } = await createItem(ctx(ADMIN), "ANNOUNCEMENT", input("ANNOUNCEMENT", { "en.title": "Delete me" }));
    await transition(ctx(ADMIN), id, "delete");
    expect((await listItems(ctx(ADMIN), "ANNOUNCEMENT")).map((r) => r.id)).not.toContain(id);
    expect((await listItems(ctx(ADMIN), "ANNOUNCEMENT", { status: "DELETED" })).map((r) => r.id)).toContain(id);
    expect(await listItems(ctx(EDITOR), "ANNOUNCEMENT", { status: "DELETED" })).toEqual([]);
    await expect(getItemForEdit(ctx(EDITOR), id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await transition(ctx(ADMIN), id, "restore")).toBe("DRAFT");
  });

  it("scheduled announcements appear at their time and expire", async () => {
    const { id } = await createItem(ctx(ADMIN), "ANNOUNCEMENT", input("ANNOUNCEMENT", { "en.title": "Scheduled", publishAt: "2030-01-10T09:00", expiresAt: "2030-01-12T09:00" }));
    await transition(ctx(ADMIN), id, "publish");
    const at = (iso: string) => listPublished("ANNOUNCEMENT", "en", new Date(iso)).then((l) => l.map((i) => i.id));
    expect(await at("2030-01-10T05:59:00Z")).not.toContain(id);
    expect(await at("2030-01-10T06:00:00Z")).toContain(id);
    expect(await at("2030-01-12T06:00:00Z")).not.toContain(id);
  });

  it("special meetings: Kuwait time stored as UTC, no home addresses", async () => {
    const { id } = await createItem(ctx(ADMIN), "EVENT", input("EVENT", { "en.title": "Test special meeting", "detail.startsAt": "2031-03-05T19:00", "detail.locationKind": "MEMBERS_HOMES" }));
    await transition(ctx(ADMIN), id, "publish");
    const [m] = (await listUpcomingSpecialMeetings("en", new Date("2031-03-01T00:00:00Z"))).filter((e) => e.id === id);
    expect(m!.startsAt.toISOString()).toBe("2031-03-05T16:00:00.000Z");
    expect(m!.locationText).toBe("");
  });
});

describe("testimonies need permission", () => {
  it("cannot be published without permission; withdrawal unpublishes", async () => {
    const { id } = await createItem(ctx(EDITOR), "TESTIMONY", input("TESTIMONY", { "en.title": "Test testimony", "en.bodyMd": "Fictional text.", "detail.anonymous": "on" }));
    await expect(transition(ctx(ADMIN), id, "publish")).rejects.toMatchObject({ code: "NOT_ALLOWED_IN_STATE" });
    await expect(recordTestimonyPermission(ctx(EDITOR), id, "GRANTED")).rejects.toMatchObject({ status: 403 });
    await recordTestimonyPermission(ctx(ADMIN), id, "GRANTED");
    await transition(ctx(ADMIN), id, "publish");
    const pub = (await listPublishedTestimonies("en")).find((t) => t.id === id);
    expect(pub).toMatchObject({ author: null });
    await recordTestimonyPermission(ctx(ADMIN), id, "WITHDRAWN");
    expect((await listPublishedTestimonies("en")).map((t) => t.id)).not.toContain(id);
    expect((await getItemForEdit(ctx(ADMIN), id)).status).toBe("DRAFT");
  });
});

describe("ministry contacts", () => {
  it("are public only once a Church Admin approves them; an editor's change withdraws approval", async () => {
    const { id } = await createItem(ctx(ADMIN), "MINISTRY", input("MINISTRY", { "en.title": "Test ministry", "detail.contactText": "[test contact]", "detail.contactApproved": "on" }));
    await transition(ctx(ADMIN), id, "publish");
    expect((await listPublishedMinistries("en")).find((m) => m.id === id)?.contact).toBe("[test contact]");
    await transition(ctx(ADMIN), id, "unpublish");
    const it = await getItemForEdit(ctx(EDITOR), id);
    await updateItem(ctx(EDITOR), id, it.version, input("MINISTRY", { "en.title": "Test ministry", "detail.contactText": "[changed contact]", "detail.contactApproved": "on" }));
    await transition(ctx(ADMIN), id, "publish");
    expect((await listPublishedMinistries("en")).find((m) => m.id === id)?.contact).toBe("");
  });
});

describe("Bible verses", () => {
  it("never serves verse text until the translation's permission is verified", async () => {
    const { id } = await createItem(ctx(EDITOR), "VERSE", input("VERSE", { "en.title": "Test verse", "detail.referenceEn": "Test 1:1", "detail.textEn": "[Fictional test text, not Scripture]", "detail.referenceTa": "சோதனை 1:1", "detail.textTa": "[சோதனை உரை]" }));
    await transition(ctx(ADMIN), id, "publish");
    await scheduleVerse(ctx(ADMIN), "2030-05-01", id);
    const before = await getDailyVerse(new Date("2030-05-01T08:00:00Z"));
    expect(before?.id).toBe(id);
    expect(before!.translations.every((t) => t.text === null && !t.downloadsAllowed)).toBe(true);
    expect(before!.translations.map((t) => t.reference)).toEqual(expect.arrayContaining(["Test 1:1", "சோதனை 1:1"]));

    await expect(setTranslationPermission(ctx(ADMIN), { translationId: "nkjv-en", verified: true, downloadsAllowed: false, creditLine: "", permissionReference: "" })).rejects.toMatchObject({ code: "INVALID" });
    await setTranslationPermission(ctx(ADMIN), { translationId: "nkjv-en", verified: true, downloadsAllowed: false, creditLine: "[test credit]", permissionReference: "[test reference]" });
    const after = await getDailyVerse(new Date("2030-05-01T08:00:00Z"));
    expect(after!.translations.find((t) => t.translationId === "nkjv-en")).toMatchObject({ text: "[Fictional test text, not Scripture]", creditLine: "[test credit]", downloadsAllowed: false });
    expect(after!.translations.find((t) => t.translationId === "bsi-ta")!.text).toBeNull();
    await setTranslationPermission(ctx(ADMIN), { translationId: "nkjv-en", verified: false, downloadsAllowed: false, creditLine: "", permissionReference: "" });
  });

  it("daily selection uses the Kuwait date (21:00 UTC is the next day in Kuwait)", async () => {
    const a = await getDailyVerse(new Date("2030-04-30T21:30:00Z"));
    expect(a?.dateKey).toBe("2030-05-01");
  });
});

describe("Tamil UTF-8 round trip", () => {
  it("stores and returns Tamil exactly, and finds it by search", async () => {
    const title = "சபை அறிவிப்பு — சோதனை ஞாயிறு பள்ளி";
    const body = "## தலைப்பு\n\nசோதனை உரை: க்ஷ ஸ்ரீ ௐ ௧௨௩";
    const { id } = await createItem(ctx(EDITOR), "ANNOUNCEMENT", input("ANNOUNCEMENT", { "ta.title": title, "ta.bodyMd": body }));
    const [row] = await getDb().select().from(contentTranslation).where(and(eq(contentTranslation.itemId, id), eq(contentTranslation.locale, "ta")));
    expect(row!.title).toBe(title.normalize("NFC"));
    expect(row!.bodyMd).toBe(body.normalize("NFC"));
    expect((await listItems(ctx(EDITOR), "ANNOUNCEMENT", { q: "அறிவிப்பு" })).map((r) => r.id)).toContain(id);
  });
});

describe("audit logging", () => {
  it("records content actions with ids and status changes only — never titles, text or emails", async () => {
    const secretTitle = "Unique-Title-Should-Not-Be-Audited";
    const { id } = await createItem(ctx(EDITOR), "ANNOUNCEMENT", input("ANNOUNCEMENT", { "en.title": secretTitle, "en.bodyMd": "Private body text" }));
    await transition(ctx(EDITOR), id, "submit");
    await transition(ctx(ADMIN), id, "publish");
    await transition(ctx(ADMIN), id, "unpublish");
    await transition(ctx(ADMIN), id, "delete");
    const rows = await getDb().select().from(auditLog).where(eq(auditLog.entityId, id));
    expect(rows.map((r) => r.action)).toEqual(["content.create", "content.submit", "content.publish", "content.unpublish", "content.delete"]);
    expect(rows.find((r) => r.action === "content.publish")).toMatchObject({ actorUserId: actors[ADMIN]!.userId, entity: "announcement", reason: "IN_REVIEW->PUBLISHED", outcome: "SUCCESS" });
    const all = JSON.stringify(await getDb().select().from(auditLog));
    expect(all).not.toContain(secretTitle);
    expect(all).not.toContain("Private body text");
    expect(all).not.toMatch(/@nltag\.test/);
    expect(all).not.toContain("198.51.100.7"); // IPs are HMAC'd
    const visible = await listAudit(ctx(ADMIN), { actionPrefix: "content." });
    expect(visible.length).toBeGreaterThan(0);
  });
});

describe("media", () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  it("accepts real images only and serves them to staff", async () => {
    const { id, mimeType } = await uploadMedia(ctx(EDITOR), { bytes: png }, { ta: "", en: "Test image" });
    expect(mimeType).toBe("image/png");
    expect((await getMediaForStaff(ctx(EDITOR), id))?.mimeType).toBe("image/png");
    await expect(getMediaForStaff(ctx(MEMBER), id)).rejects.toMatchObject({ status: 403 });
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');
    await expect(uploadMedia(ctx(EDITOR), { bytes: svg }, { ta: "", en: "" })).rejects.toMatchObject({ code: "INVALID" });
    await expect(uploadMedia(ctx(EDITOR), { bytes: new Uint8Array(2 * 1024 * 1024 + 1).fill(0xff) }, { ta: "", en: "" })).rejects.toMatchObject({ code: "INVALID" });
    await expect(uploadMedia(ctx(MEMBER), { bytes: png }, { ta: "", en: "" })).rejects.toMatchObject({ status: 403 });
  });

  it("stores bytes as a private file outside the database and fails closed without storage", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "nltag-media-it-"));
    vi.stubEnv("NLTAG_MEDIA_DIR", root);
    try {
      const { id } = await uploadMedia(ctx(EDITOR), { bytes: png }, { ta: "", en: "File image" });
      const [row] = await getDb().select().from(mediaAsset).where(eq(mediaAsset.id, id));
      expect(row?.storageKey).toBe(`${id.slice(0, 2)}/${id}`);
      expect(Object.keys(row!)).not.toContain("data");
      const file = path.join(root, id.slice(0, 2), id);
      expect(statSync(file).mode & 0o777).toBe(0o600);
      expect(new Uint8Array((await getMediaForStaff(ctx(EDITOR), id))!.data)).toEqual(png);

      writeFileSync(file, "tampered"); // altered on disk → not served
      expect(await getMediaForStaff(ctx(EDITOR), id)).toBeNull();

      // Unsafe or unusable folder: nothing is saved, no row, no file.
      const before = (await getDb().select({ id: mediaAsset.id }).from(mediaAsset)).length;
      vi.stubEnv("NLTAG_MEDIA_DIR", path.join(process.cwd(), "public", "media"));
      await expect(uploadMedia(ctx(EDITOR), { bytes: png }, { ta: "", en: "" })).rejects.toMatchObject({ code: "UNAVAILABLE" });
      expect((await getDb().select({ id: mediaAsset.id }).from(mediaAsset)).length).toBe(before);
    } finally {
      vi.unstubAllEnvs();
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("dashboard", () => {
  it("counts content by status and shows admin activity to admins", async () => {
    const d = await dashboard(ctx(ADMIN));
    expect(d.totals.draft).toBeGreaterThan(0);
    expect(d.counts.ANNOUNCEMENT).toBeDefined();
    expect(d.adminActivity?.length).toBeGreaterThan(0);
    expect(d.recentContent.length).toBeGreaterThan(0);
    // Dashboard never includes user emails.
    expect(JSON.stringify(d)).not.toMatch(/@nltag\.test/);
    const [u] = await getDb().select({ n: sql<number>`COUNT(*)` }).from(user);
    expect(Number(u!.n)).toBeGreaterThan(0);
  });
});
