// NLTAG_PUBLIC_FORMS=staff (staging test mode, owner approval 10 Nov 2026) against MariaDB:
// who may submit the forms and see the gallery, and the prayer inbox permissions per role.
// Every refusal is checked at the service, which is what a direct POST of the server action reaches
// (src/app/[locale]/form-actions.ts passes the session's principal; no principal = visitor).
// Fictional data only.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { and, eq, gte } from "drizzle-orm";
import sharp from "sharp";
import type { CurrentUser } from "@/server/auth/session";
import { AuthzError } from "@/server/auth/session";
import { closeDb, getDb } from "@/server/db/client";
import { auditLog, contactMessage, prayerRequest, testimonySubmission, user, type StaffRole } from "@/server/db/schema";
import { uploadMedia } from "@/server/cms/service";
import { issueFormToken } from "@/server/forms/protection";
import { formsMode } from "@/server/forms/mode";
import {
  deletePrayer, formAvailable, getPrayer, listPrayer, setPrayerStatus, submitContact, submitPrayer, submitTestimony,
} from "@/server/forms/service";
import { addToGallery, listPublicGallery, publicVariant, publishPhoto, recordPhotoPermission } from "@/server/gallery/service";
import type { Principal } from "@/server/policy/permissions";
import { resetTransportForTests } from "@/server/email/transport";
import { seed } from "../../scripts/db/seed";
import { clearRateLimits } from "./helpers";

const T0 = 1_800_000_000_000;
const when = (s: number) => T0 + s * 1000;
const VISITOR: Principal = { kind: "visitor" };

type Who = "admin" | "admin2faOff" | "editor" | "editorUnverified" | "prayer" | "prayer2faOff" | "member";
let people: Record<Who, CurrentUser>;
const ctx = (who: Who) => ({ actor: people[who], ip: "198.51.100.10" });
const principal = (who: Who) => people[who].principal;

async function person(email: string, roles: StaffRole[], opts: { verified?: boolean; twoFactor?: boolean } = {}): Promise<CurrentUser> {
  const verified = opts.verified ?? true;
  const twoFactor = opts.twoFactor ?? true;
  let [u] = await getDb().select().from(user).where(eq(user.email, email));
  if (!u) {
    const now = new Date();
    await getDb().insert(user).values({ id: randomUUID(), name: `[Test] ${email}`, email, emailVerified: verified, twoFactorEnabled: twoFactor, createdAt: now, updatedAt: now });
    [u] = await getDb().select().from(user).where(eq(user.email, email));
  }
  return { principal: { kind: "user", userId: u!.id, emailVerified: verified, roles, twoFactorEnabled: twoFactor }, userId: u!.id, sessionId: "test", email: u!.email, name: u!.name } as CurrentUser;
}

function form(kind: "prayer" | "contact" | "testimony", fields: Record<string, string>) {
  const f = new FormData();
  f.set("formToken", issueFormToken(kind, T0));
  f.set("website", "");
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}
const prayerForm = (n: string) => form("prayer", { body: `[STAGING TEST] gate prayer ${n}`, consent: "on" });
const contactForm = (n: string) => form("contact", { name: "[STAGING TEST]", email: "visitor@nltag.test", subject: `[STAGING TEST] ${n}`, message: `[STAGING TEST] gate message ${n}` });
const testimonyForm = (n: string) => form("testimony", { title: `[STAGING TEST] ${n}`, body: `[STAGING TEST] gate testimony body ${n} long enough to be valid.`, display: "ANONYMOUS", consentPublish: "on", consentOthers: "on" });

const saved = { ...process.env };
let started: Date;
beforeAll(async () => {
  process.env.NLTAG_PUBLIC_FORMS = "staff";
  process.env.NLTAG_DATA_KEY = "e".repeat(64);
  process.env.NLTAG_CHURCH_INBOX = "office@nltag.test";
  await seed();
  people = {
    admin: await person("gate.admin@nltag.test", ["CHURCH_ADMIN"]),
    admin2faOff: await person("gate.admin.no2fa@nltag.test", ["CHURCH_ADMIN"], { twoFactor: false }),
    editor: await person("gate.editor@nltag.test", ["CONTENT_EDITOR"], { twoFactor: false }),
    editorUnverified: await person("gate.editor.unverified@nltag.test", ["CONTENT_EDITOR"], { verified: false, twoFactor: false }),
    prayer: await person("gate.prayer@nltag.test", ["PRAYER_TEAM"]),
    prayer2faOff: await person("gate.prayer.no2fa@nltag.test", ["PRAYER_TEAM"], { twoFactor: false }),
    member: await person("gate.member@nltag.test", []),
  };
});
beforeEach(async () => {
  started = new Date(Date.now() - 1000);
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

const deniedSince = (action: string, reason?: string) =>
  getDb()
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.action, action), eq(auditLog.outcome, "DENIED"), gte(auditLog.createdAt, started), ...(reason ? [eq(auditLog.reason, reason)] : [])));

describe("staff-only forms (NLTAG_PUBLIC_FORMS=staff)", () => {
  it("is active in this (non-production) environment", () => {
    expect(formsMode()).toBe("staff");
  });

  it("refuses visitors and accounts without a usable staff role on every form; nothing is stored; each refusal is audited", async () => {
    const refused: [string, Principal][] = [
      ["visitor", VISITOR],
      ["member", principal("member")],
      ["unverified editor", principal("editorUnverified")],
      ["prayer team without two-factor", principal("prayer2faOff")],
      ["church admin without two-factor", principal("admin2faOff")],
    ];
    let i = 0;
    for (const [label, viewer] of refused) {
      for (const f of ["prayer", "contact", "testimony"] as const) expect(formAvailable(f, viewer), `${label} ${f}`).toBe(false);
      expect(await submitPrayer("en", prayerForm(`r${i}`), when(5), viewer), label).toEqual({ kind: "unavailable" });
      expect(await submitContact("en", contactForm(`r${i}`), when(5), viewer), label).toEqual({ kind: "unavailable" });
      expect(await submitTestimony("en", testimonyForm(`r${i}`), when(5), viewer), label).toEqual({ kind: "unavailable" });
      i++;
    }
    // No viewer passed at all (the default) is a visitor too.
    expect(await submitPrayer("en", prayerForm("default"), when(5))).toEqual({ kind: "unavailable" });
    expect(await getDb().select().from(prayerRequest)).toHaveLength(0);
    expect(await getDb().select().from(contactMessage)).toHaveLength(0);
    expect(await getDb().select().from(testimonySubmission)).toHaveLength(0);
    const audits = await deniedSince("form.refused", "not-open");
    expect(audits).toHaveLength(refused.length * 3 + 1);
    expect(audits.some((a) => a.actorUserId === people.member.userId)).toBe(true);
    expect(audits.some((a) => a.actorUserId === null)).toBe(true);
  });

  it("accepts signed-in staff (Church Admin, Content Editor, Prayer Team with two-factor)", async () => {
    for (const who of ["admin", "editor", "prayer"] as const) {
      expect(await submitPrayer("en", prayerForm(who), when(5), principal(who)), who).toEqual({ kind: "received" });
      expect(await submitContact("en", contactForm(who), when(5), principal(who)), who).toEqual({ kind: "received" });
      expect(await submitTestimony("en", testimonyForm(who), when(5), principal(who)), who).toEqual({ kind: "received" });
    }
    expect(await getDb().select().from(prayerRequest)).toHaveLength(3);
    expect(await getDb().select().from(testimonySubmission)).toHaveLength(3);
  });

  it("the gallery and its image copies are hidden from visitors and non-staff, shown to staff", async () => {
    const bytes = await sharp({ create: { width: 1200, height: 800, channels: 3, background: { r: 120, g: 160, b: 200 } } }).jpeg().toBuffer();
    const { id: mediaId } = await uploadMedia(ctx("editor"), { bytes: new Uint8Array(bytes) }, { ta: "", en: "[Test] gate photo" });
    const { id } = await addToGallery(ctx("editor"), mediaId, { ta: "", en: "[Test] gate caption" });
    await recordPhotoPermission(ctx("admin"), id, "GRANTED", "Consent forms on file (test)");
    await publishPhoto(ctx("admin"), id);
    for (const viewer of [VISITOR, principal("member"), principal("prayer2faOff")]) {
      expect((await listPublicGallery("en", 1, viewer)).total).toBe(0);
      expect(await publicVariant(id, 960, viewer)).toBeNull();
    }
    expect(await publicVariant(id, 960)).toBeNull(); // default viewer = visitor
    expect((await listPublicGallery("en", 1, principal("editor"))).photos.map((p) => p.id)).toContain(id);
    expect(await publicVariant(id, 960, principal("prayer"))).not.toBeNull();
  });
});

describe("prayer inbox permissions in staff-only mode", () => {
  async function oneRequest() {
    expect(await submitPrayer("en", prayerForm(randomUUID()), when(5), principal("admin"))).toEqual({ kind: "received" });
    return (await listPrayer(ctx("admin"))).rows[0]!.id;
  }

  it("Church Admin lists, opens, updates and deletes", async () => {
    const id = await oneRequest();
    expect((await getPrayer(ctx("admin"), id)).body).toContain("[STAGING TEST]");
    await setPrayerStatus(ctx("admin"), id, "PRAYED");
    await deletePrayer(ctx("admin"), id);
    expect(await getDb().select().from(prayerRequest)).toHaveLength(0);
  });

  it("Prayer Team (verified, two-factor) lists, opens and updates status, but cannot delete", async () => {
    const id = await oneRequest();
    expect((await listPrayer(ctx("prayer"))).total).toBe(1);
    expect((await getPrayer(ctx("prayer"), id)).body).toContain("[STAGING TEST]");
    await setPrayerStatus(ctx("prayer"), id, "PRAYED");
    expect((await getPrayer(ctx("admin"), id)).status).toBe("PRAYED");
    await expect(deletePrayer(ctx("prayer"), id)).rejects.toBeInstanceOf(AuthzError);
    expect(await getDb().select().from(prayerRequest)).toHaveLength(1);
    expect(await deniedSince("policy.deny", "prayer.delete")).not.toHaveLength(0);
  });

  it("Prayer Team without two-factor gets nothing", async () => {
    const id = await oneRequest();
    await expect(listPrayer(ctx("prayer2faOff"))).rejects.toBeInstanceOf(AuthzError);
    await expect(getPrayer(ctx("prayer2faOff"), id)).rejects.toBeInstanceOf(AuthzError);
    await expect(setPrayerStatus(ctx("prayer2faOff"), id, "PRAYED")).rejects.toBeInstanceOf(AuthzError);
  });

  it("Content Editors (verified or not) and members can never list, open, update or delete; each attempt is audited", async () => {
    const id = await oneRequest();
    for (const who of ["editor", "editorUnverified", "member"] as const) {
      await expect(listPrayer(ctx(who)), who).rejects.toBeInstanceOf(AuthzError);
      await expect(getPrayer(ctx(who), id), who).rejects.toBeInstanceOf(AuthzError);
      await expect(setPrayerStatus(ctx(who), id, "PRAYED"), who).rejects.toBeInstanceOf(AuthzError);
      await expect(deletePrayer(ctx(who), id), who).rejects.toBeInstanceOf(AuthzError);
    }
    const [row] = await getDb().select().from(prayerRequest).where(eq(prayerRequest.id, id));
    expect(row?.status).not.toBe("PRAYED");
    const denied = await deniedSince("policy.deny");
    expect(denied.filter((a) => a.actorUserId === people.editor.userId).map((a) => a.reason).sort()).toEqual(["prayer.delete", "prayer.manage", "prayer.read", "prayer.read"].sort());
    // Opening a request is audited only for people who may read it.
    const viewed = await getDb().select().from(auditLog).where(and(eq(auditLog.action, "prayer.viewed"), eq(auditLog.entityId, id)));
    expect(viewed.map((v) => v.actorUserId)).not.toContain(people.editor.userId);
  });
});
