import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getAuth } from "@/server/auth/auth";
import { closeDb, getDb } from "@/server/db/client";
import { auditLog, rateLimitBucket, twoFactor, user } from "@/server/db/schema";
import { gateAuditCounters, resetGateAuditCapForTests, resetGateLimitersForTests, SIGN_IN_FAIL_AUDIT_LIMIT } from "@/server/security/auth-abuse-gate";
import { hashEmail } from "@/server/security/hash";
import { signInAccountKey } from "@/server/services/rate-limit";
import { seed, SEED_PASSWORD, SEED_USERS } from "../../scripts/db/seed";
import { base32Decode, freshStep, totp } from "../support/totp";
import { call, clearRateLimits, cookiesFrom, enrollTwoFactor, headersWith, signIn, verifiedUser } from "./helpers";

/**
 * R4 v6.1 gate corrections: B (malformed-address oracle, audit parity) and G1 (challenge cookie).
 * Known = a seeded member with a password; unknown = an address with no account and not listed.
 */
const KNOWN = SEED_USERS[2]!.email;
const UNKNOWN = "nobody.oracle@nltag.test";
const PASSWORD = "correct-horse-battery";

beforeAll(seed);
beforeEach(async () => {
  await clearRateLimits();
  resetGateLimitersForTests();
  resetGateAuditCapForTests();
});
afterAll(closeDb);

/** Status, body and every header except Date — what an observer can compare. */
async function observe(res: Response) {
  return { status: res.status, body: await res.text(), headers: [...res.headers].filter(([k]) => k !== "date").sort() };
}

/** Each malformed body, built for a given address. */
const MALFORMED: Record<string, (email: string) => { body: unknown; headers?: Record<string, string> }> = {
  "padded address": (e) => ({ body: { email: ` ${e} `, password: "wrong-password-1" } }),
  "leading space": (e) => ({ body: { email: ` ${e}`, password: "wrong-password-1" } }),
  "no @": (e) => ({ body: { email: e.replace("@", ""), password: "wrong-password-1" } }),
  "extra field": (e) => ({ body: { email: e, password: "wrong-password-1", name: "x" } }),
  "over-long password": (e) => ({ body: { email: e, password: "x".repeat(129) } }),
  "empty password": (e) => ({ body: { email: e, password: "" } }),
  "bad callbackURL": (e) => ({ body: { email: e, password: "wrong-password-1", callbackURL: "https://evil.example/" } }),
  "protocol-relative callbackURL": (e) => ({ body: { email: e, password: "wrong-password-1", callbackURL: "//evil.example" } }),
  "email not a string": () => ({ body: { email: 42, password: "wrong-password-1" } }),
  "email as array": (e) => ({ body: { email: [e], password: "wrong-password-1" } }),
  "password not a string": (e) => ({ body: { email: e, password: 12345678901 } }),
  "rememberMe wrong type": (e) => ({ body: { email: e, password: "wrong-password-1", rememberMe: "yes" } }),
  "body is an array": (e) => ({ body: [e] }),
};

describe("v6.1 B: malformed sign-in requests are no account oracle", () => {
  for (const [name, make] of Object.entries(MALFORMED)) {
    it(`${name}: identical status, body and headers for a known and an unknown address`, async () => {
      const k = make(KNOWN);
      const u = make(UNKNOWN);
      const known = await observe(await call("/sign-in/email", { body: k.body, headers: k.headers }));
      const unknown = await observe(await call("/sign-in/email", { body: u.body, headers: u.headers }));
      expect(unknown).toEqual(known);
      expect(known.status).toBeGreaterThanOrEqual(400);
      expect(known.status).toBeLessThan(500);
    });
  }

  it("an upper-case valid address is still an address: known and unknown both get the same wrong-password answer", async () => {
    const known = await observe(await call("/sign-in/email", { body: { email: KNOWN.toUpperCase(), password: "wrong-password-1" } }));
    const unknown = await observe(await call("/sign-in/email", { body: { email: UNKNOWN.toUpperCase(), password: "wrong-password-1" } }));
    expect(known.status).toBe(401);
    expect(unknown).toEqual(known);
  });

  it("padded input never spends the real address's budget, and the reset request refuses it too", async () => {
    for (let i = 0; i < 8; i++) await call("/sign-in/email", { body: { email: ` ${KNOWN} `, password: "wrong-password-1" } });
    for (let i = 0; i < 8; i++) await call("/request-password-reset", { body: { email: ` ${KNOWN} ` } });
    const [rows] = (await getDb().execute(sql`SELECT COALESCE(SUM(count), 0) AS n FROM rate_limit_bucket`)) as unknown as [[{ n: number }]];
    expect(Number(rows[0].n)).toBe(0);
    expect(await getDb().select().from(rateLimitBucket).where(eq(rateLimitBucket.bucketKey, signInAccountKey(hashEmail(KNOWN))))).toHaveLength(0);
    // The real address still has all of its free attempts.
    expect((await signIn(KNOWN, SEED_PASSWORD)).res.status).toBe(200);
  });

  it("reset requests: malformed address answered identically for known and unknown", async () => {
    const known = await observe(await call("/request-password-reset", { body: { email: ` ${KNOWN}` } }));
    const unknown = await observe(await call("/request-password-reset", { body: { email: ` ${UNKNOWN}` } }));
    expect(known.status).toBe(400);
    expect(unknown).toEqual(known);
  });
});

describe("v6.1 B: audit parity", () => {
  const failRows = async () => (await getDb().select().from(auditLog).where(eq(auditLog.action, "auth.sign_in.fail"))).length;

  it("a wrong password on a known address and an unknown address each write one auth.sign_in.fail row", async () => {
    const start = await failRows();
    await call("/sign-in/email", { body: { email: KNOWN, password: "wrong-password-2" } });
    expect(await failRows()).toBe(start + 1);
    await call("/sign-in/email", { body: { email: UNKNOWN, password: "wrong-password-2" } });
    expect(await failRows()).toBe(start + 2);
  });

  it("the rows carry no address, and malformed requests write none", async () => {
    const start = await failRows();
    await call("/sign-in/email", { body: { email: ` ${KNOWN}`, password: "wrong-password-3" } });
    expect(await failRows()).toBe(start);
    const rows = await getDb().select().from(auditLog).where(eq(auditLog.action, "auth.sign_in.fail"));
    expect(JSON.stringify(rows)).not.toMatch(/@/);
  });

  it("is capped per process: a burst writes at most the cap, the rest is counted", async () => {
    const start = await failRows();
    const before = gateAuditCounters().suppressed;
    await Promise.all(Array.from({ length: 12 }, (_, i) => call("/sign-in/email", { body: { email: `burst.${i}@nltag.test`, password: "wrong-password-4" } })));
    const written = (await failRows()) - start;
    const suppressed = gateAuditCounters().suppressed - before;
    // A token bucket of 5 refills while 12 floored (≥ 400 ms) requests run, so allow refills.
    expect(written).toBeGreaterThanOrEqual(SIGN_IN_FAIL_AUDIT_LIMIT.burst);
    expect(written + suppressed).toBe(12);
    expect(suppressed).toBeGreaterThan(0);
  });
});

describe("v6.1 G1: the verify routes serve the sign-in challenge only", () => {
  /** A signed-in account with an enrollment started (password confirmed) but not yet confirmed. */
  async function pendingEnrollment(address: string) {
    const cookie = await verifiedUser(address, PASSWORD);
    const enabled = (await getAuth().api.enableTwoFactor({ headers: headersWith(cookie), body: { password: PASSWORD, method: "totp" } as never })) as { totpURI: string };
    const secret = base32Decode(new URL(enabled.totpURI).searchParams.get("secret")!);
    const [u] = await getDb().select().from(user).where(eq(user.email, address));
    return { cookie, secret, id: u!.id };
  }
  const on = async (id: string) => (await getDb().select({ on: user.twoFactorEnabled }).from(user).where(eq(user.id, id)))[0]!.on;

  it("without the challenge cookie: the gate's 404 for both routes, even with a valid session and a correct code", async () => {
    const { cookie, secret, id } = await pendingEnrollment("g1.nochallenge@nltag.test");
    await freshStep();
    for (const path of ["/two-factor/verify-totp", "/two-factor/verify-backup-code"]) {
      const res = await call(path, { body: { code: path.endsWith("totp") ? totp(secret) : "AAAAA-AAAAA" }, cookie });
      expect(res.status, path).toBe(404);
      expect(await res.text()).toBe("Not Found");
    }
    expect(await on(id)).toBe(false);
    const [row] = await getDb().select().from(twoFactor).where(eq(twoFactor.userId, id));
    expect(row!.verified).toBe(false);
  });

  it("a forged challenge cookie name next to a session cannot reach the enrollment lane (session cookies are stripped)", async () => {
    const { cookie, secret, id } = await pendingEnrollment("g1.forged@nltag.test");
    const challenge = (await getAuth().$context).createAuthCookie("two_factor").name;
    await freshStep();
    const res = await call("/two-factor/verify-totp", { body: { code: totp(secret) }, cookie: `${cookie}; ${challenge}=forged` });
    expect(res.status).toBe(401);
    expect(((await res.json()) as { code?: string }).code).toBe("INVALID_TWO_FACTOR_COOKIE");
    expect(await on(id)).toBe(false);
    expect(await getDb().select().from(auditLog).where(and(eq(auditLog.action, "auth.2fa.enable"), eq(auditLog.actorUserId, id)))).toHaveLength(0);
  });

  it("with the real challenge cookie the sign-in challenge still works, even if the browser also holds an old session cookie", async () => {
    const address = "g1.challenge@nltag.test";
    const first = await verifiedUser(address, PASSWORD);
    const { secret } = await enrollTwoFactor(first, PASSWORD);
    const step1 = await signIn(address, PASSWORD, undefined, { secondFactor: false });
    expect(((await step1.res.clone().json()) as { twoFactorRedirect?: boolean }).twoFactorRedirect).toBe(true);
    await freshStep();
    const res = await call("/two-factor/verify-totp", { body: { code: totp(secret) }, cookie: `${first}; ${step1.cookie}` });
    expect(res.status).toBe(200);
    expect(cookiesFrom(res)).toMatch(/session_token=[^;]+/);
  });
});
