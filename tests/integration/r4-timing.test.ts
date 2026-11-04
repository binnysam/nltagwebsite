import { monitorEventLoopDelay } from "node:perf_hooks";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/server/db/client";
import { resetGateLimitersForTests, resetTimingEstimatorForTests, TIMING_FLOOR_MS } from "@/server/security/auth-abuse-gate";
import { hashEmail } from "@/server/security/hash";
import { signInAccountKey } from "@/server/services/rate-limit";
import { seed, SEED_USERS } from "../../scripts/db/seed";
import { call, clearRateLimits } from "./helpers";

const MEMBER = SEED_USERS[2]!.email;
const N = Number(process.env.R4_TIMING_SAMPLES ?? 200);

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!;
};
const summary = (xs: number[]) => ({ n: xs.length, p10: +pct(xs, 10).toFixed(1), median: +pct(xs, 50).toFixed(1), p90: +pct(xs, 90).toFixed(1), p99: +pct(xs, 99).toFixed(1), max: +Math.max(...xs).toFixed(1) });

async function timed(email: string): Promise<{ ms: number; status: number; body: string; headers: string[][] }> {
  const t0 = performance.now();
  const res = await call("/sign-in/email", { body: { email, password: "definitely-wrong-password" } });
  const body = await res.text();
  return { ms: performance.now() - t0, status: res.status, body, headers: [...res.headers].filter(([k]) => k !== "date").sort() };
}

const memberKey = signInAccountKey(hashEmail(MEMBER));
const freshMemberBudget = () => getDb().execute(sql`DELETE FROM rate_limit_bucket WHERE bucket_key = ${memberKey}`);
/** The global K class windows (`class:K:<window>`, CLASS_CEILINGS.K in auth-abuse-gate.ts). */
const clearKClassWindows = () => getDb().execute(sql`DELETE FROM rate_limit_bucket WHERE bucket_key LIKE 'class:K:%'`);

let u = 0;
/**
 * Interleaved known/unknown probes for the floored and flood tests. Owner approval 4 Nov 2026
 * (PR #16, test-only): before every pair the member's own key AND every `class:K:*` window are
 * cleared, and every probe's status is returned so the tests can require 401. Every known
 * wrong-password check takes a K slot that only a correct password gives back; without the
 * clearing the 15-minute K ceiling (90) fills after about 90 known probes and from then on both
 * classes get the same 429, held to the same floor: the comparison would be 429 vs 429, not the
 * wrong-password path. Unknown probes take no K slot, so clearing once per pair is enough. The
 * adaptive timing estimator is deliberately NOT reset here: it is part of what these tests measure.
 */
async function sample(n: number) {
  const known: number[] = [];
  const unknown: number[] = [];
  const statuses: { known: number[]; unknown: number[] } = { known: [], unknown: [] };
  for (let i = 0; i < n; i++) {
    await freshMemberBudget();
    await clearKClassWindows();
    const order = i % 2 === 0;
    const a = order ? await timed(MEMBER) : await timed(`nobody.${u++}@nltag.test`);
    const b = order ? await timed(`nobody.${u++}@nltag.test`) : await timed(MEMBER);
    (order ? known : unknown).push(a.ms);
    (order ? unknown : known).push(b.ms);
    (order ? statuses.known : statuses.unknown).push(a.status);
    (order ? statuses.unknown : statuses.known).push(b.status);
  }
  return { known, unknown, statuses };
}

/**
 * Every timed probe of sample() must have taken the wrong-password path (401). On failure, print
 * which probes did not (index within its class, status) before asserting.
 */
function expectAll401(label: string, statuses: { known: number[]; unknown: number[] }, n: number) {
  const off = (xs: number[]) => xs.flatMap((s, i) => (s === 401 ? [] : [[i, s]]));
  if (off(statuses.known).length || off(statuses.unknown).length) {
    console.error(`${label}: non-401 probes [index, status]`, JSON.stringify({ known: off(statuses.known), unknown: off(statuses.unknown) }));
  }
  expect(statuses.known).toEqual(Array(n).fill(401));
  expect(statuses.unknown).toEqual(Array(n).fill(401));
}

type Probe = { pair: number; kind: "known" | "unknown"; ms: number; status: number };

/**
 * Sampling for the raw test only (owner approval 4 Nov 2026; test-only). The floored and flood
 * tests use sample(), which clears the same windows and requires 401 but keeps the estimator.
 * Three measurement corrections:
 *  1. Before every known probe the member's own key AND every `class:K:*` window are cleared (as
 *     sample() does), so every known probe is a real wrong-password check answered 401. Without it
 *     the 15-minute K ceiling (90) filled during this test and its last known probes were 429s
 *     that never ran a password check.
 *  2. The adaptive timing estimator is reset before every probe. With the fixed floor at 0 an
 *     answer is still held to `common work + 1.1 × the slowest of the last 32 password-work
 *     samples`, unknown-address calibration hashes included, so one stall anywhere held about 16
 *     later known answers at its level. After the reset a probe's time reflects its own work
 *     (still × 1.1, so never less than the raw answer).
 *  3. Every probe's status is recorded (all must be 401) and the event-loop delay is measured, so
 *     a failure can print the whole series and show whether the process itself stalled.
 */
async function sampleRaw(n: number) {
  const series: Probe[] = [];
  const loop = monitorEventLoopDelay({ resolution: 10 });
  loop.enable();
  try {
    for (let pair = 0; pair < n; pair++) {
      const order: Probe["kind"][] = pair % 2 === 0 ? ["known", "unknown"] : ["unknown", "known"];
      for (const kind of order) {
        if (kind === "known") {
          await freshMemberBudget();
          await getDb().execute(sql`DELETE FROM rate_limit_bucket WHERE bucket_key LIKE 'class:K:%'`);
        }
        resetTimingEstimatorForTests();
        const r = await timed(kind === "known" ? MEMBER : `nobody.${u++}@nltag.test`);
        series.push({ pair, kind, ms: r.ms, status: r.status });
      }
    }
  } finally {
    loop.disable();
  }
  const ms = (ns: number) => +(ns / 1e6).toFixed(1);
  return {
    series,
    known: series.filter((s) => s.kind === "known").map((s) => s.ms),
    unknown: series.filter((s) => s.kind === "unknown").map((s) => s.ms),
    eventLoopDelayMs: { resolution: 10, mean: ms(loop.mean), p50: ms(loop.percentile(50)), p90: ms(loop.percentile(90)), p99: ms(loop.percentile(99)), max: ms(loop.max) },
  };
}

beforeAll(async () => {
  await seed();
  await clearRateLimits();
  resetGateLimitersForTests();
});
afterAll(closeDb);

describe("R4 change 5: unknown and known addresses are indistinguishable", () => {
  it("same status, body and headers for a wrong password and an unknown address", async () => {
    await freshMemberBudget();
    const k = await timed(MEMBER);
    const x = await timed("nobody.shape@nltag.test");
    expect(k.status).toBe(401);
    expect(x.status).toBe(k.status);
    expect(x.body).toBe(k.body);
    expect(x.headers).toEqual(k.headers);
  });

  it("identical 429 sequences: 8 attempts on a known and an unknown address", async () => {
    await freshMemberBudget();
    const ks = [];
    const us = [];
    for (let i = 0; i < 8; i++) {
      const k = await call("/sign-in/email", { body: { email: MEMBER, password: "wrong-password-x" } });
      const x = await call("/sign-in/email", { body: { email: "nobody.seq@nltag.test", password: "wrong-password-x" } });
      ks.push([k.status, k.headers.get("retry-after")]);
      us.push([x.status, x.headers.get("retry-after")]);
    }
    expect(us).toEqual(ks);
  });

  it("raw (no floor) wrong-password time, for choosing the floor", async () => {
    const saved = { ...TIMING_FLOOR_MS };
    (TIMING_FLOOR_MS as { signInFailure: number }).signInFailure = 0;
    try {
      const n = Math.min(N, 100);
      const { known, unknown, series, eventLoopDelayMs } = await sampleRaw(n);
      console.info("R8 raw (floor 0) known", JSON.stringify(summary(known)), "unknown", JSON.stringify(summary(unknown)));
      const statuses = (kind: Probe["kind"]) => series.filter((s) => s.kind === kind).map((s) => s.status);
      if (series.some((s) => s.status !== 401) || !(pct(known, 99) < saved.signInFailure)) {
        // Failure diagnostics: every probe in order, and whether the event loop itself stalled.
        console.error("R8 raw FAILED: series [pair, kind, ms, status]", JSON.stringify(series.map((s) => [s.pair, s.kind, +s.ms.toFixed(1), s.status])));
        console.error("R8 raw FAILED: event-loop delay (ms)", JSON.stringify(eventLoopDelayMs));
      }
      expect(statuses("known")).toEqual(Array(n).fill(401));
      expect(statuses("unknown")).toEqual(Array(n).fill(401));
      expect(pct(known, 99)).toBeLessThan(saved.signInFailure);
    } finally {
      (TIMING_FLOOR_MS as { signInFailure: number }).signInFailure = saved.signInFailure;
    }
  }, 120_000);

  it(`floored: ${N} known vs ${N} unknown interleaved — medians within 5 ms, p90 within 10 ms`, async () => {
    const { known, unknown, statuses } = await sample(N);
    const k = summary(known);
    const x = summary(unknown);
    console.info("R8 floored known", JSON.stringify(k), "unknown", JSON.stringify(x));
    expectAll401("R8 floored", statuses, N);
    expect(Math.abs(k.median - x.median)).toBeLessThanOrEqual(5);
    expect(Math.abs(k.p90 - x.p90)).toBeLessThanOrEqual(10);
    expect(k.median).toBeGreaterThanOrEqual(TIMING_FLOOR_MS.signInFailure);
  }, 300_000);

  it("floored, while 24 concurrent unknown-address sign-ins run in the same process", async () => {
    let stop = false;
    let flooded = 0;
    const worker = async () => {
      while (!stop) {
        await call("/sign-in/email", { body: { email: `flood.${u++}@nltag.test`, password: "x-wrong-password" } });
        flooded += 1;
      }
    };
    const workers = Array.from({ length: 24 }, worker);
    const n = Math.min(N, 100);
    const { known, unknown, statuses } = await sample(n);
    stop = true;
    await Promise.all(workers);
    const k = summary(known);
    const x = summary(unknown);
    console.info(`R8 under in-process flood (${flooded} flood requests) known`, JSON.stringify(k), "unknown", JSON.stringify(x));
    expectAll401("R8 under in-process flood", statuses, n);
    expect(Math.abs(k.median - x.median)).toBeLessThanOrEqual(15);
  }, 300_000);
});
