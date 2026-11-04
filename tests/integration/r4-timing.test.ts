import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/server/db/client";
import { resetGateLimitersForTests, TIMING_FLOOR_MS } from "@/server/security/auth-abuse-gate";
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

let u = 0;
async function sample(n: number) {
  const known: number[] = [];
  const unknown: number[] = [];
  for (let i = 0; i < n; i++) {
    await freshMemberBudget();
    const order = i % 2 === 0;
    const a = order ? await timed(MEMBER) : await timed(`nobody.${u++}@nltag.test`);
    const b = order ? await timed(`nobody.${u++}@nltag.test`) : await timed(MEMBER);
    (order ? known : unknown).push(a.ms);
    (order ? unknown : known).push(b.ms);
  }
  return { known, unknown };
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
      const { known, unknown } = await sample(Math.min(N, 100));
      console.info("R8 raw (floor 0) known", JSON.stringify(summary(known)), "unknown", JSON.stringify(summary(unknown)));
      expect(pct(known, 99)).toBeLessThan(saved.signInFailure);
    } finally {
      (TIMING_FLOOR_MS as { signInFailure: number }).signInFailure = saved.signInFailure;
    }
  }, 120_000);

  it(`floored: ${N} known vs ${N} unknown interleaved — medians within 5 ms, p90 within 10 ms`, async () => {
    const { known, unknown } = await sample(N);
    const k = summary(known);
    const x = summary(unknown);
    console.info("R8 floored known", JSON.stringify(k), "unknown", JSON.stringify(x));
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
    const { known, unknown } = await sample(Math.min(N, 100));
    stop = true;
    await Promise.all(workers);
    const k = summary(known);
    const x = summary(unknown);
    console.info(`R8 under in-process flood (${flooded} flood requests) known`, JSON.stringify(k), "unknown", JSON.stringify(x));
    expect(Math.abs(k.median - x.median)).toBeLessThanOrEqual(15);
  }, 300_000);
});
