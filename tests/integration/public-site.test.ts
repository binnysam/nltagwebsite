import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getCurrentUser, type CurrentUser } from "@/server/auth/session";
import { closeDb, getDb } from "@/server/db/client";
import { staffRole, user } from "@/server/db/schema";
import { parseContentForm, type ContentInput } from "@/server/cms/schemas";
import { createItem, getItemForEdit, recordTestimonyPermission, transition, updateItem } from "@/server/cms/service";
import {
  getPublishedPage, listPublished, listPublishedMinistries, listPublishedSermons, listPublishedTestimonies, listUpcomingSpecialMeetings,
} from "@/server/cms/public";
import { loadSpecialMeetings } from "@/server/cms/public-site";
import { seed, SEED_PASSWORD, SEED_USERS } from "../../scripts/db/seed";
import { clearRateLimits, headersWith, signIn } from "./helpers";

/**
 * Phase 5: what the public website may show. Fictional, bracketed test content only — nothing
 * here is church content or Scripture. Times are far in the future so other test files' data and
 * the real clock never interfere; every query passes an explicit "now".
 */
const [ADMIN, EDITOR] = SEED_USERS.map((u) => u.email) as [string, string];
const actors: Record<string, CurrentUser> = {};
const ctx = (email: string) => ({ actor: actors[email]!, ip: "198.51.100.9" });

function input(type: Parameters<typeof parseContentForm>[0], fields: Record<string, string>): ContentInput {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  const r = parseContentForm(type, f);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.data;
}

/** Kuwait wall clock → the UTC instant (UTC+3 all year). */
const kw = (local: string) => new Date(`${local}:00+03:00`);

beforeAll(async () => {
  await seed();
  await clearRateLimits();
  for (const u of SEED_USERS) {
    const [row] = await getDb().select({ id: user.id }).from(user).where(eq(user.email, u.email));
    await getDb().delete(staffRole).where(eq(staffRole.userId, row!.id));
    for (const role of u.roles) await getDb().insert(staffRole).values({ userId: row!.id, role, grantedByUserId: null, grantedAt: new Date() });
  }
  for (const email of [ADMIN, EDITOR]) {
    const { res, cookie } = await signIn(email, SEED_PASSWORD);
    expect(res.status).toBe(200);
    actors[email] = (await getCurrentUser(headersWith(cookie)))!;
  }
});
beforeEach(clearRateLimits);
afterAll(closeDb);

const ids = (list: { id: string }[]) => list.map((i) => i.id);
const FORBIDDEN_DTO_KEYS = ["createdByUserId", "updatedByUserId", "deletedAt", "status", "permissionStatus", "contactApproved", "contactText", "authorDisplayName", "anonymous", "testimonyPermission", "version"];
const noPrivateFields = (o: object) => expect(Object.keys(o).filter((k) => FORBIDDEN_DTO_KEYS.includes(k))).toEqual([]);

describe("announcements on the public site", () => {
  it("only published items inside their window: never draft, in review, archived, deleted, future or expired", async () => {
    const make = async (title: string, extra: Record<string, string> = {}) =>
      (await createItem(ctx(ADMIN), "ANNOUNCEMENT", input("ANNOUNCEMENT", { "en.title": title, "ta.title": `[த] ${title}`, ...extra }))).id;
    const visible = await make("[P5 visible]", { publishAt: "2032-02-01T09:00", expiresAt: "2032-03-01T09:00" });
    await transition(ctx(ADMIN), visible, "publish");
    const draft = await make("[P5 draft]");
    const review = await make("[P5 review]");
    await transition(ctx(EDITOR), review, "submit");
    const archived = await make("[P5 archived]");
    await transition(ctx(ADMIN), archived, "publish");
    await transition(ctx(ADMIN), archived, "archive");
    const deleted = await make("[P5 deleted]");
    await transition(ctx(ADMIN), deleted, "publish");
    await transition(ctx(ADMIN), deleted, "delete");
    const future = await make("[P5 future]", { publishAt: "2032-02-20T09:00" });
    await transition(ctx(ADMIN), future, "publish");
    const expired = await make("[P5 expired]", { publishAt: "2032-01-01T09:00", expiresAt: "2032-02-05T09:00" });
    await transition(ctx(ADMIN), expired, "publish");

    const now = kw("2032-02-10T12:00");
    for (const locale of ["ta", "en"] as const) {
      const list = await listPublished("ANNOUNCEMENT", locale, now);
      expect(ids(list)).toContain(visible);
      for (const hidden of [draft, review, archived, deleted, future, expired]) expect(ids(list)).not.toContain(hidden);
      for (const item of list) noPrivateFields(item);
    }
    // The future item switches on exactly at its Kuwait publish time.
    expect(ids(await listPublished("ANNOUNCEMENT", "en", kw("2032-02-20T08:59")))).not.toContain(future);
    expect(ids(await listPublished("ANNOUNCEMENT", "en", kw("2032-02-20T09:00")))).toContain(future);
  });

  it("a language appears only when it has a title in that language", async () => {
    const { id } = await createItem(ctx(ADMIN), "ANNOUNCEMENT", input("ANNOUNCEMENT", { "en.title": "[P5 English only]" }));
    await transition(ctx(ADMIN), id, "publish");
    expect(ids(await listPublished("ANNOUNCEMENT", "en"))).toContain(id);
    expect(ids(await listPublished("ANNOUNCEMENT", "ta"))).not.toContain(id);
  });
});

describe("special meetings on the public site", () => {
  it("lists upcoming meetings in date order, removes past ones, never shows drafts or addresses", async () => {
    const make = async (title: string, startsAt: string, endsAt: string, location: Record<string, string>) =>
      (await createItem(ctx(ADMIN), "EVENT", input("EVENT", { "en.title": title, "ta.title": `[த] ${title}`, "detail.startsAt": startsAt, "detail.endsAt": endsAt, ...location }))).id;
    const later = await make("[P5 later]", "2033-06-20T19:00", "2033-06-20T21:00", { "detail.locationKind": "OTHER", "detail.locationText": "[P5 hall]" });
    const sooner = await make("[P5 sooner]", "2033-06-12T19:00", "2033-06-12T21:00", { "detail.locationKind": "NECK" });
    const homes = await make("[P5 homes]", "2033-06-15T19:30", "2033-06-15T20:30", { "detail.locationKind": "MEMBERS_HOMES" });
    const past = await make("[P5 past]", "2033-06-01T19:00", "2033-06-01T21:00", { "detail.locationKind": "NECK" });
    for (const id of [later, sooner, homes, past]) await transition(ctx(ADMIN), id, "publish");
    const draft = await make("[P5 draft meeting]", "2033-06-13T19:00", "2033-06-13T21:00", { "detail.locationKind": "NECK" });

    const now = kw("2033-06-10T10:00");
    const list = (await listUpcomingSpecialMeetings("en", now)).filter((m) => [later, sooner, homes, past, draft].includes(m.id));
    expect(ids(list)).toEqual([sooner, homes, later]);
    expect(list.find((m) => m.id === later)!.locationText).toBe("[P5 hall]");
    expect(list.find((m) => m.id === homes)!.locationText).toBe("");
    expect(list.find((m) => m.id === sooner)!.locationText).toBe("");
    // A meeting stays listed while it is running and leaves at its end.
    expect(ids(await listUpcomingSpecialMeetings("en", kw("2033-06-12T20:00")))).toContain(sooner);
    expect(ids(await listUpcomingSpecialMeetings("en", kw("2033-06-12T21:01")))).not.toContain(sooner);
    // Unpublishing removes it immediately.
    await transition(ctx(ADMIN), later, "unpublish");
    expect(ids(await listUpcomingSpecialMeetings("en", now))).not.toContain(later);
  });

  it("merges both language versions for the cards (Tamil first, English beneath)", async () => {
    const { id } = await createItem(ctx(ADMIN), "EVENT", input("EVENT", { "en.title": "[P5 bilingual]", "ta.title": "[P5 இருமொழி]", "en.summary": "[P5 summary]", "detail.startsAt": "2034-01-05T19:00", "detail.locationKind": "TO_BE_ANNOUNCED" }));
    await transition(ctx(ADMIN), id, "publish");
    const m = (await loadSpecialMeetings(kw("2034-01-01T00:00"))).find((x) => x.id === id)!;
    expect(m.ta?.title).toBe("[P5 இருமொழி]");
    expect(m.en).toEqual({ title: "[P5 bilingual]", summary: "[P5 summary]" });
    expect(m.locationKind).toBe("TO_BE_ANNOUNCED");
  });
});

describe("sermons, ministries and testimonies", () => {
  it("sermons: published only, newest sermon date first, public fields only", async () => {
    const make = async (title: string, date: string) =>
      (await createItem(ctx(ADMIN), "SERMON", input("SERMON", { "en.title": title, "detail.speaker": "[P5 speaker]", "detail.bibleReference": "[Book 1:1]", "detail.sermonDate": date, "detail.videoUrl": "https://video.example.test/p5" }))).id;
    const older = await make("[P5 older sermon]", "2035-01-01");
    const newer = await make("[P5 newer sermon]", "2035-02-01");
    const draft = await make("[P5 draft sermon]", "2035-03-01");
    await transition(ctx(ADMIN), older, "publish");
    await transition(ctx(ADMIN), newer, "publish");
    const list = (await listPublishedSermons("en")).filter((s) => [older, newer, draft].includes(s.id));
    expect(ids(list)).toEqual([newer, older]);
    expect(list[0]).toMatchObject({ speaker: "[P5 speaker]", sermonDate: "2035-02-01", videoUrl: "https://video.example.test/p5" });
    noPrivateFields(list[0]!);
  });

  it("ministries: unapproved contact lines never appear", async () => {
    const { id } = await createItem(ctx(EDITOR), "MINISTRY", input("MINISTRY", { "en.title": "[P5 ministry]", "detail.contactText": "[P5 unapproved contact]", "detail.contactApproved": "on" }));
    await transition(ctx(EDITOR), id, "submit");
    await transition(ctx(ADMIN), id, "publish");
    const m = (await listPublishedMinistries("en")).find((x) => x.id === id)!;
    expect(m.contact).toBe(""); // an editor cannot approve
    noPrivateFields(m);
  });

  it("testimonies: only with granted permission; anonymous stays anonymous; named shows the display name", async () => {
    const named = (await createItem(ctx(EDITOR), "TESTIMONY", input("TESTIMONY", { "en.title": "[P5 named]", "en.bodyMd": "[Fictional]", "detail.authorDisplayName": "[P5 Display Name]" }))).id;
    const anon = (await createItem(ctx(EDITOR), "TESTIMONY", input("TESTIMONY", { "en.title": "[P5 anonymous]", "en.bodyMd": "[Fictional]", "detail.authorDisplayName": "[P5 Hidden Name]", "detail.anonymous": "on" }))).id;
    const noPermission = (await createItem(ctx(EDITOR), "TESTIMONY", input("TESTIMONY", { "en.title": "[P5 no permission]", "en.bodyMd": "[Fictional]", "detail.anonymous": "on" }))).id;
    for (const id of [named, anon]) {
      await recordTestimonyPermission(ctx(ADMIN), id, "GRANTED");
      await transition(ctx(ADMIN), id, "publish");
    }
    const list = await listPublishedTestimonies("en");
    expect(list.find((x) => x.id === named)?.author).toBe("[P5 Display Name]");
    expect(list.find((x) => x.id === anon)?.author).toBeNull();
    expect(JSON.stringify(list)).not.toContain("[P5 Hidden Name]");
    expect(ids(list)).not.toContain(noPermission);
    for (const x of list) noPrivateFields(x);
    await recordTestimonyPermission(ctx(ADMIN), named, "WITHDRAWN");
    expect(ids(await listPublishedTestimonies("en"))).not.toContain(named);
  });
});

describe("pages", () => {
  it("reserved slugs resolve when published; an unlisted page is reachable by slug but not listed", async () => {
    const { id } = await createItem(ctx(ADMIN), "PAGE", input("PAGE", { slug: "p5-welcome-test", visibility: "UNLISTED", "en.title": "[P5 welcome]", "en.summary": "[P5 lead]" }));
    expect(await getPublishedPage("p5-welcome-test", "en")).toBeNull();
    await transition(ctx(ADMIN), id, "publish");
    expect((await getPublishedPage("p5-welcome-test", "en"))?.summary).toBe("[P5 lead]");
    expect(ids(await listPublished("PAGE", "en"))).not.toContain(id);
    // A published page edited by an admin changes on the next read (cache is cleared by the write).
    const item = await getItemForEdit(ctx(ADMIN), id);
    await updateItem(ctx(ADMIN), id, item.version, input("PAGE", { slug: "p5-welcome-test", visibility: "UNLISTED", "en.title": "[P5 welcome]", "en.summary": "[P5 lead changed]" }));
    expect((await getPublishedPage("p5-welcome-test", "en"))?.summary).toBe("[P5 lead changed]");
  });
});
