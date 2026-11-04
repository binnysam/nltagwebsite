import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { signupPolicy } from "@/server/auth/signup-allowlist";
import { flushVerificationPurgeForTests, purgeExpiredVerificationsSometimes } from "@/server/auth/verification-purge";
import { closeDb, getDb, getPool } from "@/server/db/client";
import { account, user } from "@/server/db/schema";
import { purgeExpiredBucketsSometimes } from "@/server/services/rate-limit";
import { seed } from "../../scripts/db/seed";
import { call, clearRateLimits, requestAccount, restoreEnv, verifiedUser } from "./helpers";

/**
 * D16 finding 3 (owner-approved fix, 4 Nov 2026). Before a sign-in attempt reaches its rate-limit
 * reservation, every address must cost the same work: exactly one user lookup by email. The time up
 * to the reservation is the request's own and is not padded by the adaptive hold, so a lookup skipped
 * for some addresses (allowlisted ones, before the fix) made them answer one query faster under load.
 *
 * Deterministic, no timing: every SQL statement sent through the pool during one wrong-password
 * sign-in is recorded in order (Drizzle sends every statement outside a transaction through
 * `getPool().query`; the rate-limit purge's DELETE runs in its own transaction and is not part of a
 * request). The statements before the first `rate_limit_bucket` statement must be exactly the one
 * user lookup, for every address shape that exists in production.
 */

const ALLOWLISTED_NO_ACCOUNT = "lookup.listed.none@nltag.test";
const ALLOWLISTED_REQUESTED = "lookup.listed.requested@nltag.test";
const ALLOWLISTED_ACTIVE = "lookup.listed.active@nltag.test";
const UNLISTED_ACTIVE = "lookup.unlisted.active@nltag.test";
const UNLISTED_NO_ACCOUNT = "lookup.unlisted.none@nltag.test";
const STAFF_ALLOWLIST = [ALLOWLISTED_NO_ACCOUNT, ALLOWLISTED_REQUESTED, ALLOWLISTED_ACTIVE].join(",");

const USER_LOOKUP = /^select `id` from `user` where `user`\.`email` = \? limit \?$/;

let savedAllowlist: string | undefined;

async function accountState(email: string) {
  const [row] = await getDb().select({ id: user.id }).from(user).where(eq(user.email, email));
  if (!row) return "no user row";
  const accounts = await getDb().select({ providerId: account.providerId, password: account.password }).from(account).where(eq(account.userId, row.id));
  return accounts.some((a) => a.providerId === "credential" && a.password) ? "credential" : "user row, no credential";
}

beforeAll(async () => {
  savedAllowlist = process.env.NLTAG_SIGNUP_ALLOWLIST;
  await seed();
  await clearRateLimits();
  // Production-shaped fixtures, through the real routes:
  // account requested but no password yet (mailbox-first: user row, no credential) ...
  process.env.NLTAG_SIGNUP_ALLOWLIST = STAFF_ALLOWLIST;
  expect((await requestAccount(ALLOWLISTED_REQUESTED)).status).toBe(202);
  // ... and active accounts (request, set-password link, first password, sign-in).
  await verifiedUser(ALLOWLISTED_ACTIVE);
  await verifiedUser(UNLISTED_ACTIVE);
  // The explicit staff allowlist for every probe below (UNLISTED_* are not on it).
  process.env.NLTAG_SIGNUP_ALLOWLIST = STAFF_ALLOWLIST;
  await clearRateLimits();
}, 120_000);

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  restoreEnv("NLTAG_SIGNUP_ALLOWLIST", savedAllowlist);
  await closeDb();
});

/** Every statement sent through the pool while `fn` runs, in order, normalised. */
async function statementsDuring(fn: () => Promise<Response>) {
  // No background purge may start inside the window: run both now (each then waits out its interval).
  await purgeExpiredBucketsSometimes();
  purgeExpiredVerificationsSometimes();
  await flushVerificationPurgeForTests();
  const spy = vi.spyOn(getPool(), "query");
  try {
    const res = await fn();
    const statements = spy.mock.calls.map(([q, params]) => {
      const text = typeof q === "string" ? q : (q as { sql: string }).sql;
      const values = (params ?? (q as { values?: unknown[] }).values ?? []) as unknown[];
      return { sql: text.replace(/\s+/g, " ").trim().toLowerCase(), values };
    });
    return { status: res.status, statements };
  } finally {
    spy.mockRestore();
  }
}

const cases = [
  { label: "allowlisted, no account", email: ALLOWLISTED_NO_ACCOUNT, listed: true, state: "no user row" },
  { label: "allowlisted, account requested but no password", email: ALLOWLISTED_REQUESTED, listed: true, state: "user row, no credential" },
  { label: "allowlisted, active account", email: ALLOWLISTED_ACTIVE, listed: true, state: "credential" },
  { label: "not allowlisted, active account", email: UNLISTED_ACTIVE, listed: false, state: "credential" },
  { label: "not allowlisted, no account", email: UNLISTED_NO_ACCOUNT, listed: false, state: "no user row" },
] as const;

describe("R4 finding 3: the same user lookup before the rate-limit reservation, for every address", () => {
  it("fixtures have the production shapes they claim (explicit staff allowlist)", async () => {
    const policy = signupPolicy();
    expect(policy.kind).toBe("allowlist");
    for (const c of cases) {
      expect(policy.kind === "allowlist" && policy.emails.has(c.email), c.label).toBe(c.listed);
      expect(await accountState(c.email), c.label).toBe(c.state);
    }
  });

  it.each(cases)("$label: exactly one email lookup, then the reservation", async ({ email }) => {
    const { status, statements } = await statementsDuring(() =>
      call("/sign-in/email", { body: { email, password: "definitely-wrong-password" } }),
    );
    expect(status).toBe(401);
    const firstRateLimit = statements.findIndex((s) => s.sql.includes("rate_limit_bucket"));
    expect(firstRateLimit, "a rate-limit reservation was made").toBeGreaterThan(-1);
    const before = statements.slice(0, firstRateLimit);
    expect(before.map((s) => s.sql)).toEqual([expect.stringMatching(USER_LOOKUP)]);
    expect(before[0]!.values[0]).toBe(email);
  });
});
