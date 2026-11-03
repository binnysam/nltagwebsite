import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/server/db/client";
import { account, auditLog, staffRole, twoFactor as twoFactorTable, user } from "@/server/db/schema";
import { runEnvBootstrap } from "@/server/services/env-bootstrap";
import { bootstrapFirstAdmin, RoleError } from "@/server/services/roles";
import { ACCOUNT_REQUEST_LIMIT, resetAccountRequestLimiterForTests } from "@/server/auth/request-account";
import { call, clearRateLimits, enrollTwoFactor, freshIp, mailTo, requestAccount, signIn, verifiedUser } from "./helpers";

/**
 * Phase 6a against MariaDB through the real Better Auth handler:
 * staff-only sign-up allowlist and the build-time first-admin bootstrap.
 */

const LISTED = "listed.staff@nltag.test";
const OTHER = "not.listed@nltag.test";

afterAll(closeDb);
// Isolation: the account-request limiter is per process (5/s, burst 20) and the burst test below
// empties it; every test starts with a fresh one.
beforeEach(async () => {
  await clearRateLimits();
  resetAccountRequestLimiterForTests();
});
afterEach(() => {
  delete process.env.NLTAG_SIGNUP_ALLOWLIST;
});

const usersWith = (email: string) => getDb().select().from(user).where(eq(user.email, email));

// R4 class C (D1): the allowlist now decides who an account request provisions. Requests go
// through the real /api/account-request route; the answer is decided before the address is read.
describe("staff-only account-request allowlist", () => {
  it("creates an account and sends mail for a listed address", async () => {
    process.env.NLTAG_SIGNUP_ALLOWLIST = `Listed.Staff@NLTAG.test, editor@nltag.test`;
    const res = await requestAccount(LISTED);
    expect(res.status).toBe(202);
    expect(await usersWith(LISTED)).toHaveLength(1);
    expect(mailTo(LISTED)).toHaveLength(1);
  });

  it("answers an unlisted address exactly like a listed one, with no row, no credential and no email", async () => {
    process.env.NLTAG_SIGNUP_ALLOWLIST = `${LISTED},second.listed@nltag.test`;
    const observe = async (res: Response) => ({ status: res.status, body: await res.text(), headers: [...res.headers].filter(([k]) => k !== "date").sort(), cookies: res.headers.getSetCookie() });
    const real = await observe(await requestAccount("second.listed@nltag.test"));
    const refused = await observe(await requestAccount(OTHER));
    expect(refused).toEqual(real);
    expect(real.status).toBe(202);
    expect(real.cookies).toEqual([]);
    expect(await usersWith(OTHER)).toHaveLength(0);
    expect(mailTo(OTHER)).toHaveLength(0);
    expect(await usersWith("second.listed@nltag.test")).toHaveLength(1);
    const creds = await getDb().select().from(account).where(eq(account.userId, (await usersWith("second.listed@nltag.test"))[0]!.id));
    expect(creds).toHaveLength(0); // even a listed address gets no credential until the link is used
  });

  it("refuses everyone when the list contains an invalid entry (fail closed)", async () => {
    process.env.NLTAG_SIGNUP_ALLOWLIST = `fail.closed.listed@nltag.test,not-an-email`;
    const res = await requestAccount("fail.closed@nltag.test");
    expect(res.status).toBe(202); // same generic answer
    expect(await usersWith("fail.closed@nltag.test")).toHaveLength(0);
    expect(mailTo("fail.closed@nltag.test")).toHaveLength(0);
    const listed = await requestAccount("fail.closed.listed@nltag.test");
    expect(listed.status).toBe(202);
    expect(await usersWith("fail.closed.listed@nltag.test")).toHaveLength(0); // listed entries are refused too
    expect(mailTo("fail.closed.listed@nltag.test")).toHaveLength(0);
  });

  it("does not affect sign-in or password reset for existing accounts", async () => {
    await verifiedUser("existing.staff@nltag.test", "correct-horse-battery");
    process.env.NLTAG_SIGNUP_ALLOWLIST = "someone.else@nltag.test";
    const { res } = await signIn("existing.staff@nltag.test", "correct-horse-battery");
    expect(res.status).toBe(200);
    const reset = await call("/request-password-reset", { body: { email: "existing.staff@nltag.test", redirectTo: "/en/reset-password" }, ip: freshIp() });
    expect(reset.status).toBe(200);
    expect(mailTo("existing.staff@nltag.test").length).toBeGreaterThanOrEqual(2);
  });

  it("still rate-limits refused requests like real ones (identical status sequences)", async () => {
    process.env.NLTAG_SIGNUP_ALLOWLIST = LISTED;
    // A concurrent burst, so the per-process limiter's refill cannot depend on how long the
    // (listed-only) background work takes: the answer must not depend on the address at all.
    const burst = async (address: (i: number) => string) => {
      resetAccountRequestLimiterForTests();
      const res = await Promise.all(Array.from({ length: ACCOUNT_REQUEST_LIMIT.burst + 2 }, (_, i) => requestAccount(address(i))));
      return res.map((r) => r.status).sort();
    };
    const listed = await burst(() => LISTED);
    const refused = await burst((i) => `probe${i}@nltag.test`);
    expect(refused).toEqual(listed);
    expect(listed.filter((s) => s === 202)).toHaveLength(ACCOUNT_REQUEST_LIMIT.burst);
    expect(listed.filter((s) => s === 429)).toHaveLength(2);
    expect(await usersWith("probe0@nltag.test")).toHaveLength(0);
  });
});

describe("first Church Admin bootstrap from NLTAG_BOOTSTRAP_ADMIN_EMAIL", () => {
  const ADMIN = "boot.admin@nltag.test";
  const base = {
    NODE_ENV: "production",
    NLTAG_ACCOUNTS_ENABLED: "1",
    AUTH_RATE_LIMIT: "on",
    SMTP_HOST: "smtp.example.test",
    SMTP_USER: "u",
    SMTP_PASS: "p",
    SMTP_FROM: "NLTAG <u@example.test>",
    NLTAG_SIGNUP_ALLOWLIST: `${ADMIN},boot.unverified@nltag.test`,
  };
  const env = (extra: Record<string, string> = {}) => ({ ...base, ...extra }) as unknown as NodeJS.ProcessEnv;
  const reasonOf = (e: unknown) => (e instanceof RoleError ? e.code : "unexpected");
  const run = (extra?: Record<string, string>) => runEnvBootstrap(env(extra), { bootstrap: bootstrapFirstAdmin, reasonOf });
  const admins = () => getDb().select().from(staffRole).where(eq(staffRole.role, "CHURCH_ADMIN"));

  beforeEach(async () => {
    await getDb().delete(staffRole);
  });

  /** Isolation: each test builds the account state it needs instead of inheriting it. */
  async function bootAdmin(twoFactor: boolean) {
    if ((await usersWith(ADMIN)).length === 0) await verifiedUser(ADMIN);
    const [u] = await usersWith(ADMIN);
    if (twoFactor && !u!.twoFactorEnabled) {
      const { cookie } = await signIn(ADMIN, "correct-horse-battery");
      await enrollTwoFactor(cookie);
    }
    if (!twoFactor && u!.twoFactorEnabled) {
      await getDb().delete(twoFactorTable).where(eq(twoFactorTable.userId, u!.id));
      await getDb().update(user).set({ twoFactorEnabled: false }).where(eq(user.id, u!.id));
    }
  }

  it("is a no-op without the variable", async () => {
    await bootAdmin(false);
    const r = await run();
    expect(r.granted).toBe(false);
    expect(r.message).toMatch(/^No admin bootstrap requested/);
    expect(await admins()).toHaveLength(0);
  });

  it("refuses an existing but unverified account", async () => {
    process.env.NLTAG_SIGNUP_ALLOWLIST = base.NLTAG_SIGNUP_ALLOWLIST;
    // Mailbox-first fixture: the account was requested, but the emailed link was never used.
    await requestAccount("boot.unverified@nltag.test");
    expect((await usersWith("boot.unverified@nltag.test"))[0]!.emailVerified).toBe(false);
    const r = await run({ NLTAG_BOOTSTRAP_ADMIN_EMAIL: "boot.unverified@nltag.test" });
    expect(r).toEqual({ granted: false, message: "Admin bootstrap not done: UNVERIFIED" });
    expect(await admins()).toHaveLength(0);
  });

  it("refuses a verified account that is not on the allowlist", async () => {
    await verifiedUser("boot.unlisted@nltag.test");
    const r = await run({ NLTAG_BOOTSTRAP_ADMIN_EMAIL: "boot.unlisted@nltag.test" });
    expect(r.granted).toBe(false);
    expect(r.message).toMatch(/not on NLTAG_SIGNUP_ALLOWLIST/);
    expect(await admins()).toHaveLength(0);
  });

  it("refuses a verified, listed account that has not set up two-factor (Phase 6b)", async () => {
    await bootAdmin(false);
    const r = await run({ NLTAG_BOOTSTRAP_ADMIN_EMAIL: ADMIN });
    expect(r).toEqual({ granted: false, message: "Admin bootstrap not done: NO_TWO_FACTOR" });
    expect(await admins()).toHaveLength(0);
  });

  it("grants once with an audit row, then is idempotent", async () => {
    // Phase 6b: the first admin enrolls an authenticator before the bootstrap build.
    await bootAdmin(true);
    const first = await run({ NLTAG_BOOTSTRAP_ADMIN_EMAIL: " Boot.Admin@NLTAG.test " });
    expect(first.granted).toBe(true);
    const [u] = await usersWith(ADMIN);
    const rows = await admins();
    expect(rows.map((r) => r.userId)).toEqual([u!.id]);
    const audits = await getDb()
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "role.bootstrap"), eq(auditLog.entityId, u!.id)));
    expect(audits.length).toBeGreaterThan(0);

    const again = await run({ NLTAG_BOOTSTRAP_ADMIN_EMAIL: ADMIN });
    expect(again).toEqual({ granted: false, message: "Admin bootstrap not done: ALREADY_BOOTSTRAPPED" });
    expect(await admins()).toHaveLength(1);
  });

  it("two concurrent runs grant exactly one admin", async () => {
    await bootAdmin(true);
    const results = await Promise.all([run({ NLTAG_BOOTSTRAP_ADMIN_EMAIL: ADMIN }), run({ NLTAG_BOOTSTRAP_ADMIN_EMAIL: ADMIN })]);
    expect(results.filter((r) => r.granted)).toHaveLength(1);
    expect(await admins()).toHaveLength(1);
  });
});
