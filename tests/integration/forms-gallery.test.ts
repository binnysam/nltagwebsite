// Public forms, staff inboxes and the gallery against MariaDB (migration 0004). Fictional data only.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import sharp from "sharp";
import type { CurrentUser } from "@/server/auth/session";
import { AuthzError } from "@/server/auth/session";
import { closeDb, getDb } from "@/server/db/client";
import { auditLog, contactMessage, contentItem, prayerRequest, testimonyDetail, testimonySubmission, user, type StaffRole } from "@/server/db/schema";
import { uploadMedia, CmsError } from "@/server/cms/service";
import { issueFormToken, MIN_FILL_MS, FORM_CEILINGS } from "@/server/forms/protection";
import {
  acceptTestimonySubmission, deletePrayer, flushFormNotificationsForTests, getContact, getPrayer, getTestimonySubmission, inboxCounts, listContact,
  listPrayer, listTestimonySubmissions, setPrayerStatus, submitContact, submitPrayer, submitTestimony,
} from "@/server/forms/service";
import { addToGallery, listPublicGallery, publicVariant, publishPhoto, recordPhotoPermission, removeFromGallery, unpublishPhoto } from "@/server/gallery/service";
import { memoryOutbox, resetTransportForTests } from "@/server/email/transport";
import { flushEmailQueueForTests } from "@/server/email/send";
import { seed, SEED_USERS } from "../../scripts/db/seed";
import { clearRateLimits } from "./helpers";

const INBOX = "office@nltag.test";
const T0 = 1_800_000_000_000;
const when = (s: number) => T0 + s * 1000;

let actors: Record<"admin" | "editor" | "prayer" | "member", CurrentUser>;
const ctx = (who: keyof typeof actors) => ({ actor: actors[who], ip: "198.51.100.9" });

async function actor(email: string, roles: StaffRole[], name: string): Promise<CurrentUser> {
  let [u] = await getDb().select().from(user).where(eq(user.email, email));
  if (!u) {
    const now = new Date();
    await getDb().insert(user).values({ id: randomUUID(), name, email, emailVerified: true, twoFactorEnabled: true, createdAt: now, updatedAt: now });
    [u] = await getDb().select().from(user).where(eq(user.email, email));
  }
  return { principal: { kind: "user", userId: u!.id, emailVerified: true, roles, twoFactorEnabled: true }, userId: u!.id, sessionId: "test", email: u!.email, name: u!.name } as CurrentUser;
}

/** A form as the browser sends it: valid token issued 5 s earlier, empty honeypot. */
function form(kind: "prayer" | "contact" | "testimony", fields: Record<string, string>, issuedAt = T0) {
  const f = new FormData();
  f.set("formToken", issueFormToken(kind, issuedAt));
  f.set("website", "");
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

const saved = { ...process.env };
beforeAll(async () => {
  process.env.NLTAG_PUBLIC_FORMS = "1";
  process.env.NLTAG_DATA_KEY = "d".repeat(64);
  process.env.NLTAG_CHURCH_INBOX = INBOX;
  await seed();
  actors = {
    admin: await actor(SEED_USERS[0]!.email, ["CHURCH_ADMIN"], "Test Admin A"),
    editor: await actor(SEED_USERS[1]!.email, ["CONTENT_EDITOR"], "Test Editor B"),
    member: await actor(SEED_USERS[2]!.email, [], "Test Member C"),
    prayer: await actor("prayer.p@nltag.test", ["PRAYER_TEAM"], "Test Prayer P"),
  };
});
beforeEach(async () => {
  await clearRateLimits();
  await getDb().delete(prayerRequest);
  await getDb().delete(contactMessage);
  await getDb().delete(testimonySubmission);
  resetTransportForTests();
});
afterAll(async () => {
  process.env = saved;
  await closeDb();
});

describe("prayer requests", () => {
  const body = "Please pray for my mother's recovery after surgery.";

  it("stores an encrypted request, notifies the inbox without its content, and audits ids only", async () => {
    const r = await submitPrayer("ta", form("prayer", { body, name: "Test Visitor", contact: "visitor@nltag.test", contactRequested: "on", consent: "on" }), when(5));
    expect(r).toEqual({ kind: "received" });
    await flushFormNotificationsForTests();
    await flushEmailQueueForTests();
    const [raw] = (await getDb().execute(sql`SELECT * FROM prayer_request`)) as unknown as [Record<string, unknown>[]];
    expect(raw).toHaveLength(1);
    const dump = JSON.stringify(raw[0]);
    for (const s of ["mother", "Test Visitor", "visitor@nltag.test"]) expect(dump).not.toContain(s);
    expect(raw[0]!.notified_at).not.toBeNull();
    const mail = memoryOutbox.filter((m) => m.to === INBOX);
    expect(mail).toHaveLength(1);
    expect(JSON.stringify(mail[0])).not.toMatch(/mother|Test Visitor|visitor@nltag/);
    const audits = await getDb().select().from(auditLog).where(eq(auditLog.action, "prayer.received"));
    expect(JSON.stringify(audits)).not.toMatch(/mother|Test Visitor|visitor@/);
  });

  it("Church Admin and Prayer Team can read it (audited); Content Editors and members cannot", async () => {
    await submitPrayer("en", form("prayer", { body, consent: "on" }), when(5));
    const list = await listPrayer(ctx("prayer"));
    expect(list.total).toBe(1);
    expect(JSON.stringify(list.rows)).not.toContain("mother");
    const one = await getPrayer(ctx("prayer"), list.rows[0]!.id);
    expect(one.body).toBe(body);
    expect(one.name).toBe("");
    expect((await getPrayer(ctx("admin"), list.rows[0]!.id)).body).toBe(body);
    await expect(listPrayer(ctx("editor"))).rejects.toBeInstanceOf(AuthzError);
    await expect(getPrayer(ctx("editor"), list.rows[0]!.id)).rejects.toBeInstanceOf(AuthzError);
    await expect(getPrayer(ctx("member"), list.rows[0]!.id)).rejects.toBeInstanceOf(AuthzError);
    const viewed = await getDb().select().from(auditLog).where(and(eq(auditLog.action, "prayer.viewed"), eq(auditLog.entityId, list.rows[0]!.id)));
    expect(viewed.length).toBeGreaterThanOrEqual(2);
    expect(await inboxCounts(ctx("editor"))).toEqual({ testimony: 0 });
  });

  it("Prayer Team marks status but only a Church Admin deletes, and delete removes the row", async () => {
    await submitPrayer("en", form("prayer", { body, consent: "on" }), when(5));
    const id = (await listPrayer(ctx("admin"))).rows[0]!.id;
    await setPrayerStatus(ctx("prayer"), id, "PRAYED");
    expect((await getPrayer(ctx("admin"), id)).status).toBe("PRAYED");
    await expect(deletePrayer(ctx("prayer"), id)).rejects.toBeInstanceOf(AuthzError);
    await deletePrayer(ctx("admin"), id);
    expect(await getDb().select().from(prayerRequest)).toHaveLength(0);
    await expect(getPrayer(ctx("admin"), id)).rejects.toBeInstanceOf(CmsError);
  });

  it("refuses silently: honeypot, missing or too-fast token, duplicate within 24 h", async () => {
    const hp = form("prayer", { body, consent: "on" });
    hp.set("website", "http://spam.example");
    expect(await submitPrayer("en", hp, when(5))).toEqual({ kind: "received" });
    expect(await submitPrayer("en", form("prayer", { body, consent: "on" }), T0 + MIN_FILL_MS - 1)).toEqual({ kind: "received" });
    const noToken = form("prayer", { body, consent: "on" });
    noToken.delete("formToken");
    expect(await submitPrayer("en", noToken, when(5))).toEqual({ kind: "received" });
    expect(await getDb().select().from(prayerRequest)).toHaveLength(0);
    await submitPrayer("en", form("prayer", { body, consent: "on" }), when(5));
    await submitPrayer("en", form("prayer", { body: body.toUpperCase(), consent: "on" }), when(10));
    expect(await getDb().select().from(prayerRequest)).toHaveLength(1);
  });

  it("an old form is 'expired'; invalid input returns field errors and stores nothing", async () => {
    expect(await submitPrayer("en", form("prayer", { body, consent: "on" }, T0), T0 + 3 * 3600_000)).toEqual({ kind: "expired" });
    const r = await submitPrayer("en", form("prayer", { body: "hi" }), when(5));
    expect(r).toEqual({ kind: "invalid", errors: { body: "form.error.tooShort", consent: "form.error.consent" } });
    expect(await getDb().select().from(prayerRequest)).toHaveLength(0);
  });

  it("the site-wide ceiling refuses further requests in the window ('busy')", async () => {
    const max = FORM_CEILINGS.prayer.burst.max;
    for (let i = 0; i < max; i++) expect((await submitPrayer("en", form("prayer", { body: `${body} number ${i}`, consent: "on" }), when(5))).kind).toBe("received");
    expect(await submitPrayer("en", form("prayer", { body: `${body} one more`, consent: "on" }), when(6))).toEqual({ kind: "busy" });
    expect(await getDb().select().from(prayerRequest)).toHaveLength(max);
  });

  it("is unavailable without the data key or the switch", async () => {
    process.env.NLTAG_DATA_KEY = "";
    expect(await submitPrayer("en", form("prayer", { body, consent: "on" }), when(5))).toEqual({ kind: "unavailable" });
    process.env.NLTAG_DATA_KEY = "d".repeat(64);
    process.env.NLTAG_PUBLIC_FORMS = "0";
    expect(await submitPrayer("en", form("prayer", { body, consent: "on" }), when(5))).toEqual({ kind: "unavailable" });
    await expect(listPrayer(ctx("admin"))).rejects.toBeInstanceOf(CmsError);
    process.env.NLTAG_PUBLIC_FORMS = "1";
  });
});

describe("contact messages", () => {
  const fields = { name: "Test Visitor", email: "visitor@nltag.test", phone: "+965 2222 3333", subject: "Visiting", message: "Can I visit on Friday with my family?" };
  it("stores the message and emails it to the church inbox; Church Admin only", async () => {
    expect(await submitContact("en", form("contact", fields), when(5))).toEqual({ kind: "received" });
    await flushFormNotificationsForTests();
    await flushEmailQueueForTests();
    const mail = memoryOutbox.filter((m) => m.to === INBOX);
    expect(mail).toHaveLength(1);
    expect(mail[0]!.text).toContain("Can I visit on Friday");
    const list = await listContact(ctx("admin"));
    expect(list.rows[0]!.subject).toBe("Visiting");
    expect((await getContact(ctx("admin"), list.rows[0]!.id)).phone).toBe("+965 2222 3333");
    await expect(listContact(ctx("editor"))).rejects.toBeInstanceOf(AuthzError);
    await expect(listContact(ctx("prayer"))).rejects.toBeInstanceOf(AuthzError);
  });
});

describe("testimony submissions", () => {
  const fields = { title: "[Test] A testimony", body: "God answered our prayers for a new job after a long wait.", display: "FIRST_NAME", name: "Test Person", contact: "person@nltag.test", consentPublish: "on", consentOthers: "on" };

  it("are never published automatically; accepting creates a draft with permission recorded by the Church Admin", async () => {
    await submitTestimony("en", form("testimony", fields), when(5));
    const id = (await listTestimonySubmissions(ctx("admin"))).rows[0]!.id;
    expect((await getDb().select().from(contentItem).where(eq(contentItem.type, "TESTIMONY"))).filter((r) => r.status === "PUBLISHED" && r.createdAt > new Date(Date.now() - 60_000))).toHaveLength(0);
    const { contentItemId } = await acceptTestimonySubmission(ctx("admin"), id);
    const [item] = await getDb().select().from(contentItem).where(eq(contentItem.id, contentItemId));
    expect(item!.status).toBe("DRAFT");
    const [detail] = await getDb().select().from(testimonyDetail).where(eq(testimonyDetail.itemId, contentItemId));
    expect(detail!.authorDisplayName).toBe("Test");
    expect(detail!.permissionStatus).toBe("GRANTED");
    await expect(acceptTestimonySubmission(ctx("admin"), id)).rejects.toBeInstanceOf(CmsError);
  });

  it("Content Editors read the text but never the submitter's contact; Prayer Team sees nothing", async () => {
    await submitTestimony("en", form("testimony", fields), when(5));
    const id = (await listTestimonySubmissions(ctx("editor"))).rows[0]!.id;
    expect((await getTestimonySubmission(ctx("editor"), id)).contact).toBeNull();
    expect((await getTestimonySubmission(ctx("admin"), id)).contact).toBe("person@nltag.test");
    await expect(listTestimonySubmissions(ctx("prayer"))).rejects.toBeInstanceOf(AuthzError);
    const { contentItemId } = await acceptTestimonySubmission(ctx("editor"), id);
    const [detail] = await getDb().select().from(testimonyDetail).where(eq(testimonyDetail.itemId, contentItemId));
    expect(detail?.permissionStatus ?? "NOT_RECORDED").toBe("NOT_RECORDED");
  });
});

describe("gallery", () => {
  async function photoWithGps() {
    const bytes = await sharp({ create: { width: 2000, height: 1200, channels: 3, background: { r: 200, g: 150, b: 100 } } })
      .jpeg()
      .withExif({ IFD0: { Make: "TestCam", Copyright: "SECRET-OWNER" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "29/1 22/1 0/1" } })
      .toBuffer();
    const { id } = await uploadMedia(ctx("editor"), { bytes: new Uint8Array(bytes) }, { ta: "", en: "[Test] photo" });
    return id;
  }

  it("publishes only with permission; public copies are resized and carry no metadata; unpublish and removal hide them", async () => {
    const mediaId = await photoWithGps();
    const { id } = await addToGallery(ctx("editor"), mediaId, { ta: "", en: "[Test] caption" });
    await expect(publishPhoto(ctx("editor"), id)).rejects.toBeInstanceOf(AuthzError);
    await expect(publishPhoto(ctx("admin"), id)).rejects.toThrow(/permission/);
    expect(await publicVariant(id, 960)).toBeNull();
    await expect(recordPhotoPermission(ctx("admin"), id, "GRANTED", "")).rejects.toBeInstanceOf(CmsError);
    await recordPhotoPermission(ctx("admin"), id, "GRANTED", "Consent forms on file (test)");
    await publishPhoto(ctx("admin"), id);

    const v = await publicVariant(id, 960);
    expect(v).not.toBeNull();
    const meta = await sharp(v!).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(960);
    expect(meta.exif).toBeUndefined();
    expect(v!.includes(Buffer.from("SECRET-OWNER"))).toBe(false);
    expect(await publicVariant(id, 123)).toBeNull();
    const pub = await listPublicGallery("ta");
    expect(pub.photos.map((p) => p.id)).toContain(id);
    expect(pub.photos.find((p) => p.id === id)!.caption).toBe("[Test] caption");

    await recordPhotoPermission(ctx("admin"), id, "WITHDRAWN", "");
    expect(await publicVariant(id, 960)).toBeNull();
    await recordPhotoPermission(ctx("admin"), id, "GRANTED", "Consent forms on file (test)");
    await publishPhoto(ctx("admin"), id);
    await unpublishPhoto(ctx("admin"), id);
    expect(await publicVariant(id, 960)).toBeNull();
    await removeFromGallery(ctx("admin"), id);
    expect((await listPublicGallery("en")).photos.map((p) => p.id)).not.toContain(id);
  });
});
