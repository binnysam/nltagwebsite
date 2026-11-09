import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { confirmEnrollment, disableTwoFactor, regenerateRecoveryCodes, startEnrollment } from "@/app/[locale]/(account)/account/two-factor/actions";
import { getAuth } from "@/server/auth/auth";
import { getCurrentUser, requirePermission } from "@/server/auth/session";
import { closeDb, getDb } from "@/server/db/client";
import { auditLog, session, staffRole, twoFactor, user, verification } from "@/server/db/schema";
import { bootstrapFirstAdmin, RoleError } from "@/server/services/roles";
import { base32Decode, freshStep, totp, wrongCode } from "../support/totp";
import { call, clearRateLimits, cookiesFrom, enrollTwoFactor, freshIp, headersWith, linkIn, mailTo, requestAccount, signIn, verifiedUser } from "./helpers";

/**
 * Phase 6b against MariaDB 11.8 through the real Better Auth handler: authenticator enrollment,
 * the sign-in challenge, single-use recovery codes, password + code for turning off and for new
 * recovery codes, lockout, the Church Admin requirement and the session guard.
 * Fictional @nltag.test accounts only.
 */
/**
 * R4 class D: the server actions read the caller's request headers through next/headers. Each test
 * sets the signed-in browser whose cookie the action sees (the same cookie the page would send).
 */
const caller = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => caller.headers }));
const asCaller = (cookie: string) => {
  caller.headers = headersWith(cookie);
};

const PASSWORD = "correct-horse-battery";
let n = 0;
const email = (tag: string) => `tf.${tag}.${++n}@nltag.test`;

afterAll(closeDb);
beforeEach(clearRateLimits);

const idOf = async (address: string) => (await getDb().select({ id: user.id }).from(user).where(eq(user.email, address)))[0]!.id;
const sessionOf = async (cookie: string) => (await call("/get-session", { method: "GET", cookie })).json() as Promise<{ user: { id: string; twoFactorEnabled: boolean } } | null>;
const audits = async (action: string, actor?: string) =>
  getDb()
    .select()
    .from(auditLog)
    .where(actor ? and(eq(auditLog.action, action), eq(auditLog.actorUserId, actor)) : eq(auditLog.action, action));
const errorCode = async (res: Response) => ((await res.json()) as { code?: string }).code;

/** A verified account with two-factor on; returns its secret, recovery codes and a session. */
async function enrolled(tag: string) {
  const address = email(tag);
  const first = await verifiedUser(address, PASSWORD);
  const e = await enrollTwoFactor(first, PASSWORD);
  return { address, ...e, id: await idOf(address) };
}

describe("migration 0003_two_factor (MariaDB)", () => {
  it("adds the two_factor table and user.two_factor_enabled (default off) without touching other tables", async () => {
    const [cols] = (await getDb().execute(
      sql`SELECT column_name AS c, column_default AS d, is_nullable AS n FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'user' AND column_name = 'two_factor_enabled'`,
    )) as unknown as [{ c: string; d: string; n: string }[]];
    expect(cols).toHaveLength(1);
    expect(cols[0]!.n).toBe("NO");
    expect(String(cols[0]!.d)).toMatch(/^0|false$/);
    const [tables] = (await getDb().execute(sql`SELECT table_collation AS c FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'two_factor'`)) as unknown as [{ c: string }[]];
    expect(tables[0]!.c).toBe("utf8mb4_uca1400_ai_ci");
    const [fk] = (await getDb().execute(
      sql`SELECT delete_rule AS r FROM information_schema.referential_constraints WHERE constraint_schema = DATABASE() AND table_name = 'two_factor'`,
    )) as unknown as [{ r: string }[]];
    expect(fk[0]!.r).toBe("CASCADE");
    const [applied] = (await getDb().execute(sql`SELECT COUNT(*) AS k FROM __drizzle_migrations`)) as unknown as [{ k: number }[]];
    // 0000–0003, plus 0004_forms_gallery (Nov 2026).
    expect(Number(applied[0]!.k)).toBe(5);
  });
});

describe("enrollment", () => {
  // R4 class D (D6): enrollment exists only as the account page's server actions; the HTTP lanes
  // (/two-factor/enable, and verify-totp with a session) are the gate's 404.
  it("needs the password, stays off until the first code is confirmed, and stores only ciphertext (server actions only)", async () => {
    const address = email("enroll");
    const cookie = await verifiedUser(address, PASSWORD);
    const id = await idOf(address);
    asCaller(cookie);

    expect((await call("/two-factor/enable", { body: { password: PASSWORD }, cookie })).status).toBe(404);
    expect(await startEnrollment("not-the-password")).toEqual({ ok: false, error: "twoFactor.error.password" });

    const ok = await startEnrollment(PASSWORD);
    expect(ok.ok).toBe(true);
    const { uri: totpURI, codes: backupCodes } = ok as { uri: string; codes: string[] };
    const uri = new URL(totpURI);
    expect(uri.protocol).toBe("otpauth:");
    expect(uri.searchParams.get("issuer")).toBe("NLTAG");
    expect(uri.searchParams.get("digits")).toBe("6");
    expect(backupCodes).toHaveLength(10);
    expect(new Set(backupCodes).size).toBe(10);
    for (const c of backupCodes) expect(c).toMatch(/^[A-Za-z0-9]{5}-[A-Za-z0-9]{5}$/);

    // Not on yet: no flag, unverified row, and sign-in does not ask for a code.
    const [row] = await getDb().select().from(twoFactor).where(eq(twoFactor.userId, id));
    expect(row!.verified).toBe(false);
    const secret = base32Decode(uri.searchParams.get("secret")!);
    expect(row!.secret).not.toContain(new TextDecoder().decode(secret));
    for (const c of backupCodes) expect(row!.backupCodes).not.toContain(c);
    expect((await sessionOf(cookie))!.user.twoFactorEnabled).toBe(false);
    const before = await signIn(address, PASSWORD, freshIp(), { secondFactor: false });
    expect(((await before.res.json()) as { twoFactorRedirect?: boolean }).twoFactorRedirect).toBeUndefined();

    // A wrong first code leaves it off.
    expect(await confirmEnrollment(wrongCode(secret))).toEqual({ ok: false, error: "twoFactor.error.code" });
    expect((await getDb().select({ on: user.twoFactorEnabled }).from(user).where(eq(user.id, id)))[0]!.on).toBe(false);

    // A correct code over HTTP with the session (no sign-in challenge) never reaches Better Auth.
    await freshStep();
    expect((await call("/two-factor/verify-totp", { body: { code: totp(secret) }, cookie })).status).toBe(404);
    expect((await getDb().select({ on: user.twoFactorEnabled }).from(user).where(eq(user.id, id)))[0]!.on).toBe(false);

    expect(await confirmEnrollment(totp(secret))).toEqual({ ok: true });
    expect((await getDb().select({ on: user.twoFactorEnabled }).from(user).where(eq(user.id, id)))[0]!.on).toBe(true);
    expect((await getDb().select().from(twoFactor).where(eq(twoFactor.userId, id)))[0]!.verified).toBe(true);
    expect(await audits("auth.2fa.enroll_start", id)).toHaveLength(1);
    expect(await audits("auth.2fa.enable", id)).toHaveLength(1);
  });

  it("signs out every other session when it is turned on; this browser gets a fresh session", async () => {
    const address = email("revoke");
    const browser = await verifiedUser(address, PASSWORD);
    const { cookie: other } = await signIn(address, PASSWORD); // e.g. a session opened with a stolen password
    expect(await sessionOf(other)).not.toBeNull();
    const { cookie: after } = await enrollTwoFactor(browser, PASSWORD);
    expect(await sessionOf(other)).toBeNull();
    expect(await sessionOf(browser)).toBeNull(); // the pre-enrollment token in this browser is replaced
    const now = await sessionOf(after);
    expect(now!.user.twoFactorEnabled).toBe(true);
    expect(await getDb().select().from(session).where(eq(session.userId, now!.user.id))).toHaveLength(1);
  });

  it("refuses emailed codes and a second enrollment over an active one (server API and action; HTTP closed)", async () => {
    const { cookie } = await enrolled("otp");
    asCaller(cookie);
    await expect(getAuth().api.enableTwoFactor({ headers: headersWith(cookie), body: { password: PASSWORD, method: "otp" } as never })).rejects.toMatchObject({ body: { code: "TOTP_ONLY" } });
    expect(await startEnrollment(PASSWORD)).toEqual({ ok: false, error: "auth.error.generic" });
    for (const body of [{ password: PASSWORD, method: "otp" }, { password: PASSWORD }]) {
      expect((await call("/two-factor/enable", { body, cookie })).status).toBe(404);
    }
  });

  it("never hands out the secret again (get-totp-uri is switched off) and ignores send-otp", async () => {
    const { cookie } = await enrolled("uri");
    expect((await call("/two-factor/get-totp-uri", { body: { password: PASSWORD }, cookie })).status).toBe(404);
    expect((await call("/two-factor/send-otp", { body: {}, cookie })).status).toBe(404);
  });
});

describe("sign-in challenge", () => {
  it("a correct password alone gives no session; a correct code does", async () => {
    const { address, secret, id } = await enrolled("challenge");
    const ip = freshIp();
    const step1 = await signIn(address, PASSWORD, ip, { secondFactor: false });
    expect(step1.res.status).toBe(200);
    expect(await step1.res.json()).toMatchObject({ twoFactorRedirect: true, twoFactorMethods: ["totp"] });
    expect(step1.cookie).not.toMatch(/session_token=[^;]+/);
    expect(await sessionOf(step1.cookie)).toBeNull();
    // Challenge cookie: HttpOnly, signed, 5 minutes.
    const challenge = step1.res.headers.getSetCookie().find((c) => c.includes("two_factor"))!;
    expect(challenge).toMatch(/HttpOnly/i);
    expect(challenge).toMatch(/Max-Age=300/);

    await freshStep();
    const step2 = await call("/two-factor/verify-totp", { body: { code: totp(secret) }, ip, cookie: step1.cookie });
    expect(step2.status).toBe(200);
    const signedIn = cookiesFrom(step2, step1.cookie);
    expect((await sessionOf(signedIn))!.user.id).toBe(id);
    const created = await audits("auth.session.create", id);
    expect(created.some((r) => r.reason === "two-factor/verify-totp")).toBe(true);
  });

  it("rejects wrong, malformed and old codes, and audits each failure", async () => {
    const { address, secret } = await enrolled("invalid");
    const ip = freshIp();
    const { cookie } = await signIn(address, PASSWORD, ip, { secondFactor: false });
    const before = (await audits("auth.2fa.verify_fail")).length;
    const wrong = await call("/two-factor/verify-totp", { body: { code: wrongCode(secret) }, ip, cookie });
    expect(wrong.status).toBe(401);
    expect(await errorCode(wrong)).toBe("INVALID_CODE");
    const expired = await call("/two-factor/verify-totp", { body: { code: totp(secret, Date.now(), -10) }, ip: freshIp(), cookie });
    expect(expired.status).toBe(401);
    const junk = await call("/two-factor/verify-totp", { body: { code: "abcdef" }, ip: freshIp(), cookie });
    expect(junk.status).toBe(401);
    expect(await sessionOf(cookie)).toBeNull();
    expect((await audits("auth.2fa.verify_fail")).length).toBe(before + 3);
  });

  it("an expired challenge cannot be completed, even with a correct code", async () => {
    const { address, secret, id } = await enrolled("expired");
    const ip = freshIp();
    const { cookie } = await signIn(address, PASSWORD, ip, { secondFactor: false });
    // Age the challenge past its 5-minute life.
    await getDb()
      .update(verification)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(sql`${verification.value} = ${id} AND ${verification.expiresAt} > NOW(3)`);
    await freshStep();
    const res = await call("/two-factor/verify-totp", { body: { code: totp(secret) }, ip, cookie });
    expect(res.status).toBe(401);
    expect(await errorCode(res)).toBe("INVALID_TWO_FACTOR_COOKIE");
    expect(await sessionOf(cookiesFrom(res, cookie))).toBeNull();
  });

  it("refuses 'trust this device'", async () => {
    const { address, secret } = await enrolled("trust");
    const ip = freshIp();
    const { cookie } = await signIn(address, PASSWORD, ip, { secondFactor: false });
    await freshStep();
    const res = await call("/two-factor/verify-totp", { body: { code: totp(secret), trustDevice: true }, ip, cookie });
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe("TRUST_DEVICE_NOT_ALLOWED");
    expect(res.headers.getSetCookie().some((c) => c.includes("trust_device="))).toBe(false);
  });

  it("locks the second factor for 15 minutes after 5 wrong codes, even for a correct code", async () => {
    const { address, secret, id } = await enrolled("lockout");
    const ip = freshIp();
    const first = await signIn(address, PASSWORD, ip, { secondFactor: false });
    for (let i = 0; i < 5; i++) {
      const r = await call("/two-factor/verify-totp", { body: { code: wrongCode(secret) }, ip: freshIp(), cookie: first.cookie });
      expect(r.status).toBe(401);
    }
    // That challenge is used up…
    const sixth = await call("/two-factor/verify-totp", { body: { code: totp(secret) }, ip: freshIp(), cookie: first.cookie });
    expect(sixth.status).toBeGreaterThanOrEqual(400);
    // …and a fresh challenge is refused while the account is locked.
    const second = await signIn(address, PASSWORD, freshIp(), { secondFactor: false });
    await freshStep();
    const locked = await call("/two-factor/verify-totp", { body: { code: totp(secret) }, ip: freshIp(), cookie: second.cookie });
    expect(locked.status).toBe(429);
    expect(await errorCode(locked)).toBe("ACCOUNT_TEMPORARILY_LOCKED");
    const [row] = await getDb().select().from(twoFactor).where(eq(twoFactor.userId, id));
    expect(row!.lockedUntil!.getTime()).toBeGreaterThan(Date.now() + 10 * 60 * 1000);
  });

  it("limits code attempts per client IP (HTTP limiter, 10 per 15 minutes)", async () => {
    const { address, secret } = await enrolled("iplimit");
    const ip = freshIp();
    let limited = false;
    for (let i = 0; i < 12 && !limited; i++) {
      const { cookie } = await signIn(address, PASSWORD, freshIp(), { secondFactor: false });
      const r = await call("/two-factor/verify-backup-code", { body: { code: "XXXXX-XXXXX" }, ip, cookie });
      limited = r.status === 429;
    }
    expect(limited).toBe(true);
    void secret;
  });
});

describe("recovery codes", () => {
  it("each code signs in exactly once and is audited", async () => {
    const { address, backupCodes, id } = await enrolled("recovery");
    const code = backupCodes[3]!;
    const one = await signIn(address, PASSWORD, freshIp(), { secondFactor: false });
    const used = await call("/two-factor/verify-backup-code", { body: { code }, cookie: one.cookie });
    expect(used.status).toBe(200);
    expect((await sessionOf(cookiesFrom(used, one.cookie)))!.user.id).toBe(id);
    expect(await audits("auth.2fa.recovery_code.use", id)).toHaveLength(1);

    const two = await signIn(address, PASSWORD, freshIp(), { secondFactor: false });
    const reused = await call("/two-factor/verify-backup-code", { body: { code }, cookie: two.cookie });
    expect(reused.status).toBe(401);
    expect(await errorCode(reused)).toBe("INVALID_BACKUP_CODE");

    const { getAuth } = await import("@/server/auth/auth");
    const left = await getAuth().api.viewBackupCodes({ body: { userId: id } });
    expect(left.backupCodes).toHaveLength(9);
    expect(left.backupCodes).not.toContain(code);
  });

  it("two simultaneous uses of one code: at most one session", async () => {
    const { address, backupCodes } = await enrolled("race");
    const a = await signIn(address, PASSWORD, freshIp(), { secondFactor: false });
    const b = await signIn(address, PASSWORD, freshIp(), { secondFactor: false });
    const [ra, rb] = await Promise.all([
      call("/two-factor/verify-backup-code", { body: { code: backupCodes[0] }, cookie: a.cookie, ip: freshIp() }),
      call("/two-factor/verify-backup-code", { body: { code: backupCodes[0] }, cookie: b.cookie, ip: freshIp() }),
    ]);
    expect([ra.status, rb.status].filter((s) => s === 200)).toHaveLength(1);
  });

  it("new codes need the password AND a current code, and replace every old code (server action; HTTP closed)", async () => {
    const { cookie, secret, backupCodes, id, address } = await enrolled("regen");
    asCaller(cookie);
    expect((await call("/two-factor/generate-backup-codes", { body: { password: PASSWORD }, cookie })).status).toBe(404);
    // No code: refused by the action, and by the auth.ts hook if the API is called without one.
    expect(await regenerateRecoveryCodes(PASSWORD, "")).toEqual({ ok: false, error: "twoFactor.error.code" });
    await expect(getAuth().api.generateBackupCodes({ headers: headersWith(cookie), body: { password: PASSWORD } })).rejects.toMatchObject({ body: { code: "INVALID_SECOND_FACTOR" } });
    await freshStep();
    expect(await regenerateRecoveryCodes("nope-nope-nope", totp(secret))).toEqual({ ok: false, error: "twoFactor.error.password" });
    await clearRateLimits();
    await freshStep();
    const ok = await regenerateRecoveryCodes(PASSWORD, totp(secret));
    expect(ok.ok).toBe(true);
    const fresh = (ok as { codes: string[] }).codes;
    expect(fresh).toHaveLength(10);
    expect(fresh.some((c) => backupCodes.includes(c))).toBe(false);
    expect(await audits("auth.2fa.recovery_codes.regenerate", id)).toHaveLength(1);

    const s = await signIn(address, PASSWORD, freshIp(), { secondFactor: false });
    expect((await call("/two-factor/verify-backup-code", { body: { code: backupCodes[1] }, cookie: s.cookie })).status).toBe(401);
    expect((await call("/two-factor/verify-backup-code", { body: { code: fresh[1] }, cookie: s.cookie, ip: freshIp() })).status).toBe(200);
  });
});

describe("turning two-factor off", () => {
  it("needs the password and a current code; then it is off and audited (server action; HTTP closed)", async () => {
    const { cookie, secret, id } = await enrolled("disable");
    asCaller(cookie);
    expect((await call("/two-factor/disable", { body: { password: PASSWORD }, cookie })).status).toBe(404);
    await expect(getAuth().api.disableTwoFactor({ headers: headersWith(cookie), body: { password: PASSWORD } })).rejects.toMatchObject({ body: { code: "INVALID_SECOND_FACTOR" } });
    await freshStep();
    expect(await disableTwoFactor("wrong-password-x", totp(secret))).toEqual({ ok: false, error: "twoFactor.error.password" });
    expect((await getDb().select({ on: user.twoFactorEnabled }).from(user).where(eq(user.id, id)))[0]!.on).toBe(true);
    expect((await audits("auth.2fa.manage_fail", id)).length).toBeGreaterThanOrEqual(2);

    await clearRateLimits();
    await freshStep();
    expect(await disableTwoFactor(PASSWORD, totp(secret))).toEqual({ ok: true });
    expect((await getDb().select({ on: user.twoFactorEnabled }).from(user).where(eq(user.id, id)))[0]!.on).toBe(false);
    expect(await getDb().select().from(twoFactor).where(eq(twoFactor.userId, id))).toHaveLength(0);
    expect(await audits("auth.2fa.disable", id)).toHaveLength(1);
  });

  it("accepts a recovery code as the second factor (lost phone), and uses it up (server action)", async () => {
    const { cookie, backupCodes, id } = await enrolled("lostphone");
    asCaller(cookie);
    expect(await disableTwoFactor(PASSWORD, backupCodes[9]!)).toEqual({ ok: true });
    expect((await getDb().select({ on: user.twoFactorEnabled }).from(user).where(eq(user.id, id)))[0]!.on).toBe(false);
    expect(await getDb().select().from(twoFactor).where(eq(twoFactor.userId, id))).toHaveLength(0);
  });

  it("allows at most 5 management attempts per account in 15 minutes (server action)", async () => {
    const { cookie, secret, id } = await enrolled("managelimit");
    asCaller(cookie);
    const results = [];
    for (let i = 0; i < 6; i++) results.push(await disableTwoFactor(PASSWORD, wrongCode(secret)));
    expect(results.slice(0, 5)).toEqual(Array(5).fill({ ok: false, error: "twoFactor.error.code" }));
    expect(results[5]).toEqual({ ok: false, error: "auth.error.rateLimited" });
    const fails = await audits("auth.2fa.manage_fail", id);
    expect(fails.some((r) => r.reason === "two-factor/disable:429")).toBe(true);
    expect((await getDb().select({ on: user.twoFactorEnabled }).from(user).where(eq(user.id, id)))[0]!.on).toBe(true);
  });
});

describe("sessions for enrolled accounts only through the challenge", () => {
  // R4 class C (D1): verification links are gone (/verify-email is denied); the only emailed link is
  // the set-password/reset link. It never signs anyone in, and an enrolled account still needs the
  // challenge after using it.
  it("blocks any sign-in from an emailed link: a set-password/reset link never creates a session, and an enrolled account still gets the challenge", async () => {
    const address = email("bypass");
    const ip = freshIp();
    await requestAccount(address);
    const id = await idOf(address);
    // Simulate an account that already has two-factor on when an emailed link is used.
    await getDb().update(user).set({ twoFactorEnabled: true }).where(eq(user.id, id));
    const link = linkIn(mailTo(address).at(-1)!.text);
    const opened = await call(link, { method: "GET", ip });
    expect(opened.status).toBe(302);
    expect(cookiesFrom(opened)).not.toMatch(/session_token=[^;]+/);
    const token = new URL(opened.headers.get("location")!, "http://localhost:3000").searchParams.get("token")!;
    const set = await call("/reset-password", { body: { token, newPassword: PASSWORD }, ip });
    expect(set.status).toBe(200);
    expect(cookiesFrom(set)).not.toMatch(/session_token=[^;]+/);
    expect(await getDb().select().from(session).where(eq(session.userId, id))).toHaveLength(0);
    // The old verification route is closed, so its auto sign-in cannot be reached at all.
    expect((await call("/verify-email?token=x&callbackURL=%2Fen", { method: "GET", ip })).status).toBe(404);
    // With the password now set, a correct password alone still stops at the challenge.
    const step1 = await signIn(address, PASSWORD, freshIp(), { secondFactor: false });
    expect(step1.res.status).toBe(200);
    expect(await step1.res.json()).toMatchObject({ twoFactorRedirect: true });
    expect(step1.cookie).not.toMatch(/session_token=[^;]+/);
    expect(await getDb().select().from(session).where(eq(session.userId, id))).toHaveLength(0);
  });
});

describe("Church Admin requires two-factor", () => {
  it("the role grants nothing until an authenticator is enrolled, then everything", async () => {
    const address = email("admin");
    const cookie = await verifiedUser(address, PASSWORD);
    const id = await idOf(address);
    await getDb().insert(staffRole).values({ userId: id, role: "CHURCH_ADMIN", grantedByUserId: null, grantedAt: new Date() });

    const before = await getCurrentUser(headersWith(cookie));
    expect(before!.principal.twoFactorEnabled).toBe(false);
    for (const p of ["admin.access", "content.publish", "staff.manage", "audit.read", "membership.export"] as const) {
      await expect(requirePermission(headersWith(cookie), p)).rejects.toMatchObject({ status: 403 });
    }
    await expect(requirePermission(headersWith(cookie), "account.manage_own")).resolves.toBeTruthy();

    const { cookie: after } = await enrollTwoFactor(cookie, PASSWORD);
    for (const p of ["admin.access", "content.publish", "staff.manage", "audit.read"] as const) {
      await expect(requirePermission(headersWith(after), p)).resolves.toBeTruthy();
    }
    await getDb().delete(staffRole).where(eq(staffRole.userId, id));
  });

  it("a Content Editor without two-factor keeps editor access (not required for editors)", async () => {
    const address = email("editor");
    const cookie = await verifiedUser(address, PASSWORD);
    const id = await idOf(address);
    await getDb().insert(staffRole).values({ userId: id, role: "CONTENT_EDITOR", grantedByUserId: null, grantedAt: new Date() });
    await expect(requirePermission(headersWith(cookie), "content.draft.edit")).resolves.toBeTruthy();
    await getDb().delete(staffRole).where(eq(staffRole.userId, id));
  });

  it("the first-admin bootstrap refuses an account without two-factor", async () => {
    const admins = await getDb().select().from(staffRole).where(eq(staffRole.role, "CHURCH_ADMIN"));
    // Bootstrap only runs when no admin exists; park existing admin rows for this check.
    await getDb().delete(staffRole).where(eq(staffRole.role, "CHURCH_ADMIN"));
    try {
      const address = email("boot");
      await verifiedUser(address, PASSWORD);
      await expect(bootstrapFirstAdmin(address)).rejects.toMatchObject({ code: "NO_TWO_FACTOR" });
      expect(RoleError).toBeDefined();
    } finally {
      for (const a of admins) await getDb().insert(staffRole).values({ userId: a.userId, role: "CHURCH_ADMIN", grantedByUserId: a.grantedByUserId, grantedAt: a.grantedAt });
    }
  });
});
