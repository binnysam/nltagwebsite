import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getAuth } from "@/server/auth/auth";
import { purgeExpiredVerifications } from "@/server/auth/verification-purge";
import { closeDb, getDb } from "@/server/db/client";
import * as schema from "@/server/db/schema";

/**
 * M1 option B — concurrency on MariaDB (CI and the evidence run: mariadb:11.8.9).
 *
 * The CI deadlock (dc19f1f): Better Auth's findVerificationValue() range-deletes expired rows
 * (`DELETE FROM verification WHERE expires_at < ?`, expires index → PK) while another request's
 * consumeVerificationValue() transaction locks identifier index → PK → expires index entry.
 * This file drives exactly those library calls in parallel, the way a two-factor sign-in does
 * (look up the challenge, consume the attempts row, re-arm it, consume the challenge), together
 * with the new primary-key purge, and counts ER_LOCK_DEADLOCK (1213):
 *
 * - the app's configuration (disableCleanup: true) plus the purge loop: zero 1213, every live
 *   row consumed exactly once, no live row purged;
 * - a control instance with Better Auth's cleanup ON, same workload: reported (the causal check).
 *   Whether a given run deadlocks is timing-dependent, so the control's count is logged, not
 *   asserted; M1_REQUIRE_CONTROL_DEADLOCK=1 turns it into an assertion for evidence runs.
 *
 * Fictional rows only; nothing here touches accounts or mail.
 */

const ITERATIONS = Number(process.env.M1_ITERATIONS ?? 1000);
const PARALLEL = 4; // the pool has 5 connections; one is left for the purge
const BATCH = 4; // flows per round

type Adapter = Awaited<ReturnType<typeof getAuth>["$context"]>["internalAdapter"];

/** Drizzle wraps driver errors ("Failed query: …"); the MariaDB error is on `cause`. */
function isDeadlock(e: unknown): boolean {
  for (let x = e as { errno?: number; code?: string; message?: string; cause?: unknown } | undefined, i = 0; x && i < 5; x = x.cause as typeof x, i++) {
    if (x.errno === 1213 || x.code === "ER_LOCK_DEADLOCK" || /Deadlock found/i.test(String(x.message ?? ""))) return true;
  }
  return false;
}
const describeError = (e: unknown) => {
  const c = (e as { cause?: { code?: string; errno?: number } })?.cause;
  return `${String((e as Error)?.message ?? e).slice(0, 120)} [${c?.code ?? "?"} ${c?.errno ?? "?"}]`;
};

async function insertExpired(n: number) {
  const values = Array.from({ length: n }, () => {
    const past = new Date(Date.now() - (2 * 60 + Math.floor(Math.random() * 60)) * 60_000);
    return sql`(${randomUUID()}, ${`m1-expired-${randomUUID()}`}, ${"m1"}, ${past}, ${past}, ${past})`;
  });
  await getDb().execute(sql`INSERT INTO verification (id, identifier, value, expires_at, created_at, updated_at) VALUES ${sql.join(values, sql`, `)}`);
}

/** One two-factor-shaped flow on `ia`: lookup challenge, consume attempts, re-arm, consume challenge. */
async function flow(ia: Adapter, tag: string, counters: { deadlocks: number; otherErrors: number; consumed: number; expiredAccepted: number }) {
  const challenge = `m1-challenge-${tag}`;
  const attempts = `2fa-attempts-m1-${tag}`;
  const live = new Date(Date.now() + 5 * 60_000);
  try {
    await ia.createVerificationValue({ identifier: challenge, value: `user-${tag}`, expiresAt: live });
    await ia.createVerificationValue({ identifier: attempts, value: "0", expiresAt: live });
    await ia.findVerificationValue(challenge);
    await ia.consumeVerificationValue(attempts);
    await ia.createVerificationValue({ identifier: attempts, value: "1", expiresAt: live });
    await ia.findVerificationValue(attempts);
    const got = await ia.consumeVerificationValue(challenge);
    if (got) counters.consumed += 1;
    await ia.consumeVerificationValue(attempts);
    // Edge: a row that has just expired (a challenge used at the last moment) is looked up and
    // consumed. It is inside Better Auth's cleanup range, which is what lets the two lock orders
    // meet. Expired → consume returns null either way.
    const edge = `m1-edge-${tag}`;
    await ia.createVerificationValue({ identifier: edge, value: `user-${tag}`, expiresAt: new Date(Date.now() - 1) });
    await ia.findVerificationValue(edge);
    if (await ia.consumeVerificationValue(edge)) counters.expiredAccepted += 1;
  } catch (e) {
    if (isDeadlock(e)) counters.deadlocks += 1;
    else {
      counters.otherErrors += 1;
      console.info("M1 other error", describeError(e));
    }
  }
}

async function run(ia: Adapter, label: string, withPurge: boolean) {
  const counters = { deadlocks: 0, otherErrors: 0, consumed: 0, expiredAccepted: 0 };
  let purgeRuns = 0;
  let purgeDeadlocks = 0;
  let purgeOtherErrors = 0;
  let stop = false;
  const purgeLoop = (async () => {
    while (withPurge && !stop) {
      try {
        // Production purges rows expired > 1 hour; the fixture's rows are 2–3 hours old.
        await purgeExpiredVerifications(new Date());
        purgeRuns += 1;
      } catch (e) {
        if (isDeadlock(e)) purgeDeadlocks += 1;
        else purgeOtherErrors += 1;
      }
      await insertExpired(20);
    }
  })();
  const started = performance.now();
  let flows = 0;
  for (let round = 0; flows < ITERATIONS; round++) {
    await insertExpired(10);
    await Promise.all(
      Array.from({ length: PARALLEL }, (_, p) =>
        (async () => {
          for (let b = 0; b < BATCH && flows < ITERATIONS; b++) {
            flows += 1;
            await flow(ia, `${label}-${round}-${p}-${b}-${randomUUID().slice(0, 8)}`, counters);
          }
        })(),
      ),
    );
  }
  stop = true;
  await purgeLoop;
  const result = { label, flows, ...counters, purgeRuns, purgeDeadlocks, purgeOtherErrors, ms: Math.round(performance.now() - started) };
  console.info("M1 concurrency", JSON.stringify(result));
  return result;
}

let version = "";
beforeAll(async () => {
  const [rows] = (await getDb().execute(sql`SELECT VERSION() AS v`)) as unknown as [{ v: string }[]];
  version = rows[0]!.v;
  console.info("M1 concurrency database", version);
});
afterAll(closeDb);

describe("M1 option B: no deadlock between verification lookups, consumes and the purge", () => {
  it(`app configuration + purge loop: ${ITERATIONS} parallel two-factor-shaped flows, zero ER_LOCK_DEADLOCK`, async () => {
    const ctx = await getAuth().$context;
    expect(ctx.options.verification?.disableCleanup).toBe(true);
    const r = await run(ctx.internalAdapter, "app", true);
    expect(r.flows).toBe(ITERATIONS);
    expect(r.deadlocks).toBe(0);
    expect(r.purgeDeadlocks).toBe(0);
    expect(r.otherErrors).toBe(0);
    expect(r.purgeOtherErrors).toBe(0);
    expect(r.purgeRuns).toBeGreaterThan(0);
    // Every challenge was live and consumed exactly once: the purge never took a live row.
    expect(r.consumed).toBe(ITERATIONS);
    // An expired row is never accepted with the cleanup off.
    expect(r.expiredAccepted).toBe(0);
    const [left] = (await getDb().execute(sql`SELECT COUNT(*) AS n FROM verification WHERE identifier LIKE 'm1-challenge-%' OR identifier LIKE '2fa-attempts-m1-%' OR identifier LIKE 'm1-edge-%'`)) as unknown as [{ n: number }[]];
    expect(Number(left[0]!.n)).toBe(0);
  }, 600_000);

  it("control: Better Auth's own cleanup ON, same workload, no purge (causal check; count reported)", async () => {
    const control = betterAuth({
      baseURL: process.env.BETTER_AUTH_URL,
      secret: process.env.BETTER_AUTH_SECRET,
      database: drizzleAdapter(getDb(), { provider: "mysql", schema }),
      verification: { storeIdentifier: "hashed", disableCleanup: false },
      advanced: { database: { generateId: "uuid" } },
      telemetry: { enabled: false },
    });
    const ctx = await control.$context;
    expect(ctx.options.verification?.disableCleanup).toBe(false);
    const r = await run(ctx.internalAdapter as Adapter, "control", false);
    expect(r.flows).toBe(ITERATIONS);
    if (process.env.M1_REQUIRE_CONTROL_DEADLOCK === "1") expect(r.deadlocks).toBeGreaterThan(0);
  }, 600_000);
});
