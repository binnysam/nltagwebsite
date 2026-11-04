import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { purgeExpiredBucketsSometimes, reserveAttempt, THROTTLES, throttleDelaySeconds } from "@/server/services/rate-limit";
import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { clearRateLimits } from "./helpers";

/**
 * D2 (3-hour reset) re-checked on the real reserveAttempt() with a simulated clock: a greedy
 * attacker who retries the moment each delay ends, from any starting state, for 24 hours.
 */
const RULE = THROTTLES.signInAccount;

async function greedy(hours: number, startOffsetMs = 0) {
  const t0 = Date.UTC(2031, 0, 1) + startOffsetMs;
  const end = t0 + hours * 3600_000;
  const key = `sched:${startOffsetMs}:${hours}`;
  const allowedAt: number[] = [];
  let now = t0;
  let earlyAllowed = 0;
  let checkedEarly = 0;
  while (now < end) {
    const r = await reserveAttempt(key, RULE, now);
    if (r.allowed) {
      allowedAt.push(now);
      continue; // retry immediately: the next one is refused until its delay passes
    }
    // One millisecond before the slot must still be refused; at the slot it must pass.
    const slot = now + r.retryAfterSeconds * 1000;
    if (slot - 1 > now) {
      checkedEarly += 1;
      if ((await reserveAttempt(key, RULE, slot - 1)).allowed) earlyAllowed += 1;
    }
    now = slot;
  }
  return { allowedAt, earlyAllowed, checkedEarly };
}

const maxIn = (times: number[], windowMs: number) => {
  let best = 0;
  for (let i = 0, j = 0; i < times.length; i++) {
    while (times[i]! - times[j]! >= windowMs) j++;
    best = Math.max(best, i - j + 1);
  }
  return best;
};

beforeEach(clearRateLimits);
afterAll(closeDb);

describe("D2: 3-hour reset on the real reservation code", () => {
  it("rule values are the approved schedule with a 3 h reset", () => {
    expect(RULE).toEqual({ free: 5, baseDelay: 30, maxDelay: 900, resetSeconds: 10800 });
    expect([5, 6, 7, 8, 9, 10, 11].map((c) => throttleDelaySeconds(c, RULE))).toEqual([30, 60, 120, 240, 480, 900, 900]);
  });

  it("greedy attacker for 24 h: at most 9 per 15 min, 12 per hour, 104 per 24 h; never early", async () => {
    const { allowedAt, earlyAllowed, checkedEarly } = await greedy(24);
    const out = { per15: maxIn(allowedAt, 900_000), perHour: maxIn(allowedAt, 3600_000), per24h: allowedAt.length, checkedEarly, earlyAllowed };
    console.info("D2 greedy 24h", JSON.stringify(out));
    expect(out.per15).toBeLessThanOrEqual(9);
    expect(out.perHour).toBeLessThanOrEqual(12);
    expect(out.per24h).toBeLessThanOrEqual(104);
    expect(earlyAllowed).toBe(0);
    expect(checkedEarly).toBeGreaterThan(90);
  }, 120_000);

  it("a pause shorter than 3 h does not refill the free attempts; 3 h does", async () => {
    const key = "sched:pause";
    const t0 = Date.UTC(2031, 0, 2);
    for (let i = 0; i < 5; i++) expect((await reserveAttempt(key, RULE, t0)).allowed).toBe(true);
    expect((await reserveAttempt(key, RULE, t0 + 2 * 3600_000 + 59 * 60_000)).allowed).toBe(true); // a delayed slot, not a refill
    expect((await reserveAttempt(key, RULE, t0 + 2 * 3600_000 + 59 * 60_000 + 1)).allowed).toBe(false);
    const after = t0 + 2 * 3600_000 + 59 * 60_000 + 3 * 3600_000;
    for (let i = 0; i < 5; i++) expect((await reserveAttempt(key, RULE, after)).allowed).toBe(true);
  });

  it("expired buckets are purged in bounded batches, at most once a minute per process", async () => {
    const past = new Date(Date.now() - 1000);
    for (let i = 0; i < 12; i++) await getDb().execute(sql`INSERT INTO rate_limit_bucket (bucket_key, window_start, count, expires_at) VALUES (${`old:${i}`}, 0, 1, ${past})`);
    await getDb().execute(sql`INSERT INTO rate_limit_bucket (bucket_key, window_start, count, expires_at) VALUES ('live', 0, 1, ${new Date(Date.now() + 3600_000)})`);
    const now = Date.now() + 120_000;
    expect(await purgeExpiredBucketsSometimes(now, 10)).toBe(10);
    expect(await purgeExpiredBucketsSometimes(now + 1000, 10)).toBe(0); // within the minute
    expect(await purgeExpiredBucketsSometimes(now + 61_000, 10)).toBe(2);
    const [rows] = (await getDb().execute(sql`SELECT bucket_key FROM rate_limit_bucket`)) as unknown as [Array<{ bucket_key: string }>];
    expect(rows.map((r) => r.bucket_key)).toEqual(["live"]);
  });
});
