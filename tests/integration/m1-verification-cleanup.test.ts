import { randomUUID } from "node:crypto";
import { and, eq, gte, like } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getAuth } from "@/server/auth/auth";
import {
  deleteExpiredVerificationsById,
  flushVerificationPurgeForTests,
  purgeExpiredVerifications,
  purgeExpiredVerificationsSometimes,
  resetVerificationPurgeScheduleForTests,
  selectExpiredVerificationIds,
  VERIFICATION_PURGE,
} from "@/server/auth/verification-purge";
import { closeDb, getDb } from "@/server/db/client";
import { account, user, verification } from "@/server/db/schema";
import { resetGateLimitersForTests } from "@/server/security/auth-abuse-gate";
import { memoryOutbox } from "@/server/email/transport";
import { seed, SEED_PASSWORD, SEED_TOTP_SECRET, SEED_USERS } from "../../scripts/db/seed";
import { freshStep, totp } from "../support/totp";
import { verifyPassword } from "better-auth/crypto";
import { call, clearRateLimits, cookiesFrom, freshIp, linkIn, mailTo, newestLinkToken, requestAccount, restoreEnv, signIn, verifiedUser } from "./helpers";

/**
 * M1 option B (owner decision 4 Nov 2026): Better Auth's per-lookup cleanup is off
 * (`verification.disableCleanup: true`) and src/server/auth/verification-purge.ts removes expired
 * rows by primary key instead. Through the real /api/auth route on MariaDB:
 * - expired reset/set-password tokens and expired two-factor challenges are still refused;
 * - lookups no longer delete expired rows (the deadlocking range delete is gone);
 * - the purge only removes rows expired more than an hour ago, at most 200 per pass, never a live
 *   row, re-checks the expiry at delete time, and runs at most once every 10 minutes per process.
 * Fictional @nltag.test accounts and synthetic rows only.
 */

const ADMIN = SEED_USERS.find((u) => u.roles.includes("CHURCH_ADMIN"))!.email;
const PASSWORD = "correct-horse-battery";
const NEW_PASSWORD = "a-new-long-password-1";
const minutes = (m: number) => new Date(Date.now() + m * 60_000);

/** Synthetic verification rows tagged with `value` so each test counts only its own. */
async function insertRows(tag: string, n: number, expiresAt: () => Date) {
  const now = new Date();
  const rows = Array.from({ length: n }, () => ({ id: randomUUID(), identifier: `m1-purge-${randomUUID()}`, value: tag, expiresAt: expiresAt(), createdAt: now, updatedAt: now }));
  for (let i = 0; i < rows.length; i += 100) await getDb().insert(verification).values(rows.slice(i, i + 100));
  return rows.map((r) => r.id);
}
const count = async (tag: string) => (await getDb().select({ id: verification.id }).from(verification).where(eq(verification.value, tag))).length;

/** Leaves only this file's synthetic rows in scope for the purge assertions. */
async function clearSyntheticRows() {
  await getDb().delete(verification).where(like(verification.identifier, "m1-purge-%"));
}

async function resetLink(email: string): Promise<string> {
  memoryOutbox.length = 0;
  const res = await call("/request-password-reset", { body: { email, redirectTo: "/en/reset-password" }, ip: freshIp() });
  expect(res.status).toBe(200);
  const mail = mailTo(email).at(-1);
  if (!mail) throw new Error("reset mail missing");
  return new URL(linkIn(mail.text)).pathname.split("/").at(-1)!;
}

async function expireRowsFor(userId: string) {
  // Reset/set-password rows store the user id as their value.
  await getDb().update(verification).set({ expiresAt: minutes(-1) }).where(eq(verification.value, userId));
}

beforeAll(seed);
beforeEach(async () => {
  await clearRateLimits();
  resetGateLimitersForTests();
  resetVerificationPurgeScheduleForTests();
});
afterAll(closeDb);

describe("M1 option B: Better Auth configuration", () => {
  it("the running instance has disableCleanup on and identifiers still hashed", async () => {
    const ctx = await getAuth().$context;
    expect(ctx.options.verification?.disableCleanup).toBe(true);
    expect(ctx.options.verification?.storeIdentifier).toBe("hashed");
  });

  it("a verification lookup no longer deletes expired rows (no range delete on the request path)", async () => {
    await clearSyntheticRows();
    // Expired 10 minutes ago: Better Auth's cleanup (expires_at < now) would delete them; the
    // purge, which the gate may start on these requests, keeps anything expired under an hour.
    await insertRows("m1-lookup", 3, () => minutes(-10));
    // GET /reset-password/:token and POST /reset-password both call findVerificationValue.
    await call(`/reset-password/Bogus${"0".repeat(19)}?callbackURL=%2Fen%2Freset-password`, { method: "GET" });
    await call("/reset-password", { body: { token: `Bogus${"1".repeat(19)}`, newPassword: NEW_PASSWORD } });
    expect(await count("m1-lookup")).toBe(3);
    await clearSyntheticRows();
  });
});

describe("M1 option B: expired tokens are refused with the cleanup off", () => {
  it("an expired reset link: GET redirects with INVALID_TOKEN, POST is refused, the password is unchanged", async () => {
    const email = "m1.reset.expired@nltag.test";
    await verifiedUser(email, PASSWORD);
    const [u] = await getDb().select({ id: user.id }).from(user).where(eq(user.email, email));
    const token = await resetLink(email);
    await expireRowsFor(u!.id);
    // The row is still there: nothing cleans it up on the request path any more.
    expect((await getDb().select().from(verification).where(eq(verification.value, u!.id))).length).toBeGreaterThan(0);

    const get = await call(`/reset-password/${token}?callbackURL=%2Fen%2Freset-password`, { method: "GET" });
    expect(get.status).toBe(302);
    expect(get.headers.get("location")).toContain("error=INVALID_TOKEN");

    const post = await call("/reset-password", { body: { token, newPassword: NEW_PASSWORD } });
    expect(post.status).toBe(400);
    expect(((await post.json()) as { code?: string }).code).toBe("INVALID_TOKEN");

    const [cred] = await getDb().select({ password: account.password }).from(account).where(and(eq(account.userId, u!.id), eq(account.providerId, "credential")));
    expect(await verifyPassword({ hash: cred!.password!, password: PASSWORD })).toBe(true);
    expect((await signIn(email, NEW_PASSWORD)).res.status).toBe(401);
  });

  it("an expired set-password link (first password) is refused the same way", async () => {
    const email = "m1.setpw.expired@nltag.test";
    const saved = process.env.NLTAG_SIGNUP_ALLOWLIST;
    process.env.NLTAG_SIGNUP_ALLOWLIST = email;
    try {
      memoryOutbox.length = 0;
      expect((await requestAccount(email)).status).toBe(202);
      const token = newestLinkToken(email);
      const [u] = await getDb().select({ id: user.id }).from(user).where(eq(user.email, email));
      await expireRowsFor(u!.id);
      const post = await call("/reset-password", { body: { token, newPassword: NEW_PASSWORD } });
      expect(post.status).toBe(400);
      expect(((await post.json()) as { code?: string }).code).toBe("INVALID_TOKEN");
      const creds = await getDb().select().from(account).where(and(eq(account.userId, u!.id), eq(account.providerId, "credential")));
      expect(creds).toHaveLength(0);
    } finally {
      restoreEnv("NLTAG_SIGNUP_ALLOWLIST", saved);
    }
  });

  it("an expired two-factor challenge: a correct code is refused (INVALID_TWO_FACTOR_COOKIE), no session", async () => {
    const t0 = new Date(Date.now() - 1000);
    const ip = freshIp();
    const step1 = await signIn(ADMIN, SEED_PASSWORD, ip, { secondFactor: false });
    expect(((await step1.res.clone().json()) as { twoFactorRedirect?: boolean }).twoFactorRedirect).toBe(true);
    // Expire the challenge rows this sign-in created (the signed cookie itself is still valid).
    await getDb().update(verification).set({ expiresAt: minutes(-1) }).where(gte(verification.createdAt, t0));
    await freshStep();
    const res = await call("/two-factor/verify-totp", { body: { code: totp(SEED_TOTP_SECRET) }, ip, cookie: step1.cookie });
    expect(res.status).toBe(401);
    expect(((await res.json()) as { code?: string }).code).toBe("INVALID_TWO_FACTOR_COOKIE");
    expect(cookiesFrom(res)).not.toMatch(/session_token=[^;]+/);
  });

  it("a live challenge still completes (control for the test above)", async () => {
    const { res, cookie } = await signIn(ADMIN, SEED_PASSWORD, freshIp());
    expect(res.status).toBe(200);
    expect(cookie).toMatch(/session_token=[^;]+/);
  });
});

describe("M1 option B: the bounded primary-key purge", () => {
  beforeEach(clearSyntheticRows);

  it("removes only rows expired more than an hour ago, at most 200 per pass, and never a live row", async () => {
    expect(VERIFICATION_PURGE).toEqual({ intervalMs: 600_000, graceMs: 3_600_000, batch: 200 });
    await insertRows("m1-old", 450, () => minutes(-120 - Math.random() * 600));
    await insertRows("m1-grace", 30, () => minutes(-1 - Math.random() * 50)); // expired, inside the hour
    const liveIds = await insertRows("m1-live", 30, () => minutes(1 + Math.random() * 60));
    const passes: number[] = [];
    for (let i = 0; i < 5; i++) passes.push(await purgeExpiredVerifications());
    expect(passes).toEqual([200, 200, 50, 0, 0]);
    expect(await count("m1-old")).toBe(0);
    expect(await count("m1-grace")).toBe(30);
    expect(await count("m1-live")).toBe(30);
    const live = await getDb().select({ id: verification.id }).from(verification).where(eq(verification.value, "m1-live"));
    expect(new Set(live.map((r) => r.id))).toEqual(new Set(liveIds));
  });

  it("the batch can be lowered but never raised above 200", async () => {
    await insertRows("m1-cap", 260, () => minutes(-180));
    const cutoff = minutes(-60);
    expect(await selectExpiredVerificationIds(cutoff, 10_000)).toHaveLength(200);
    expect(await selectExpiredVerificationIds(cutoff, 5)).toHaveLength(5);
    expect(await purgeExpiredVerifications(new Date(), 7)).toBe(7);
    await expect(deleteExpiredVerificationsById(Array.from({ length: 201 }, () => randomUUID()), cutoff)).rejects.toThrow(/too large/);
  });

  it("the delete re-checks expiry: live or in-grace ids passed to it are kept", async () => {
    const live = await insertRows("m1-recheck-live", 5, () => minutes(30));
    const grace = await insertRows("m1-recheck-grace", 5, () => minutes(-10));
    expect(await deleteExpiredVerificationsById([...live, ...grace], minutes(-60))).toBe(0);
    expect(await count("m1-recheck-live")).toBe(5);
    expect(await count("m1-recheck-grace")).toBe(5);
  });

  it("a row whose expiry moves forward between the select and the delete is kept", async () => {
    await insertRows("m1-race", 3, () => minutes(-180));
    const cutoff = minutes(-60);
    const ids = await selectExpiredVerificationIds(cutoff);
    expect(ids).toHaveLength(3);
    await getDb().update(verification).set({ expiresAt: minutes(10) }).where(eq(verification.id, ids[0]!));
    expect(await deleteExpiredVerificationsById(ids, cutoff)).toBe(2);
    expect((await getDb().select().from(verification).where(eq(verification.id, ids[0]!))).length).toBe(1);
  });

  it("runs at most once every 10 minutes per process, returns at once and is never awaited by the caller", async () => {
    await insertRows("m1-sched", 5, () => minutes(-180));
    const t = Date.now();
    expect(purgeExpiredVerificationsSometimes(t)).toBeUndefined();
    await flushVerificationPurgeForTests();
    expect(await count("m1-sched")).toBe(0);

    await insertRows("m1-sched", 5, () => minutes(-180));
    purgeExpiredVerificationsSometimes(t + 60_000);
    purgeExpiredVerificationsSometimes(t + VERIFICATION_PURGE.intervalMs - 1);
    await flushVerificationPurgeForTests();
    expect(await count("m1-sched")).toBe(5);

    purgeExpiredVerificationsSometimes(t + VERIFICATION_PURGE.intervalMs);
    await flushVerificationPurgeForTests();
    expect(await count("m1-sched")).toBe(0);
  });

  it("the gate starts it on an auth request, and the request does not wait for it", async () => {
    await insertRows("m1-gate", 4, () => minutes(-180));
    const res = await call("/sign-in/email", { body: { email: "nobody.m1@nltag.test", password: "wrong-password-1" } });
    expect(res.status).toBe(401);
    await flushVerificationPurgeForTests();
    expect(await count("m1-gate")).toBe(0);
  });

  it("a full two-factor sign-in completes while the purge runs alongside it", async () => {
    await insertRows("m1-alongside", 200, () => minutes(-180));
    const signing = signIn(ADMIN, SEED_PASSWORD, freshIp());
    const purges = Promise.all([purgeExpiredVerifications(), purgeExpiredVerifications()]);
    const [{ res, cookie }] = await Promise.all([signing, purges]);
    expect(res.status).toBe(200);
    expect(cookie).toMatch(/session_token=[^;]+/);
    expect(await count("m1-alongside")).toBe(0);
  });
});
