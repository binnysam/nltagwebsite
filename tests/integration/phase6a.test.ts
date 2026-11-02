import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/server/db/client";
import { account, auditLog, staffRole, user } from "@/server/db/schema";
import { runEnvBootstrap } from "@/server/services/env-bootstrap";
import { bootstrapFirstAdmin, RoleError } from "@/server/services/roles";
import { call, clearRateLimits, freshIp, mailTo, signIn, signUp, verifiedUser } from "./helpers";

/**
 * Phase 6a against MariaDB through the real Better Auth handler:
 * staff-only sign-up allowlist and the build-time first-admin bootstrap.
 */

const LISTED = "listed.staff@nltag.test";
const OTHER = "not.listed@nltag.test";

afterAll(closeDb);
beforeEach(clearRateLimits);
afterEach(() => {
  delete process.env.NLTAG_SIGNUP_ALLOWLIST;
});

const usersWith = (email: string) => getDb().select().from(user).where(eq(user.email, email));

describe("staff-only sign-up allowlist", () => {
  it("creates an account and sends mail for a listed address", async () => {
    process.env.NLTAG_SIGNUP_ALLOWLIST = `Listed.Staff@NLTAG.test, editor@nltag.test`;
    const res = await signUp(LISTED);
    expect(res.status).toBe(200);
    expect(await usersWith(LISTED)).toHaveLength(1);
    expect(mailTo(LISTED)).toHaveLength(1);
  });

  it("answers an unlisted address exactly like a real sign-up, with no row, no credential and no email", async () => {
    process.env.NLTAG_SIGNUP_ALLOWLIST = `${LISTED},second.listed@nltag.test`;
    const real = await signUp("second.listed@nltag.test");
    const refused = await signUp(OTHER);
    expect(refused.status).toBe(real.status);
    const a = (await real.json()) as { token: unknown; user: Record<string, unknown> };
    const b = (await refused.json()) as { token: unknown; user: Record<string, unknown> };
    expect(Object.keys(b).sort()).toEqual(Object.keys(a).sort());
    expect(Object.keys(b.user).sort()).toEqual(Object.keys(a.user).sort());
    expect(b.token).toBeNull();
    expect(b.user.emailVerified).toBe(false);
    expect(refused.headers.getSetCookie()).toEqual(real.headers.getSetCookie());
    expect(await usersWith(OTHER)).toHaveLength(0);
    expect(mailTo(OTHER)).toHaveLength(0);
    const creds = await getDb().select().from(account).where(eq(account.accountId, String(b.user.id)));
    expect(creds).toHaveLength(0);
  });

  it("refuses everyone when the list contains an invalid entry (fail closed)", async () => {
    process.env.NLTAG_SIGNUP_ALLOWLIST = `${LISTED},not-an-email`;
    const res = await signUp("fail.closed@nltag.test");
    expect(res.status).toBe(200); // same generic answer
    expect(await usersWith("fail.closed@nltag.test")).toHaveLength(0);
    expect(mailTo("fail.closed@nltag.test")).toHaveLength(0);
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

  it("still rate-limits refused sign-ups like real ones", async () => {
    process.env.NLTAG_SIGNUP_ALLOWLIST = LISTED;
    const ip = freshIp();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await signUp(`probe${i}@nltag.test`, "correct-horse-battery", ip)).status);
    expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(statuses[5]).toBe(429);
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

  it("is a no-op without the variable", async () => {
    await verifiedUser(ADMIN);
    const r = await run();
    expect(r.granted).toBe(false);
    expect(r.message).toMatch(/^No admin bootstrap requested/);
    expect(await admins()).toHaveLength(0);
  });

  it("refuses an existing but unverified account", async () => {
    process.env.NLTAG_SIGNUP_ALLOWLIST = base.NLTAG_SIGNUP_ALLOWLIST;
    await signUp("boot.unverified@nltag.test");
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

  it("grants once with an audit row, then is idempotent", async () => {
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
    const results = await Promise.all([run({ NLTAG_BOOTSTRAP_ADMIN_EMAIL: ADMIN }), run({ NLTAG_BOOTSTRAP_ADMIN_EMAIL: ADMIN })]);
    expect(results.filter((r) => r.granted)).toHaveLength(1);
    expect(await admins()).toHaveLength(1);
  });
});
