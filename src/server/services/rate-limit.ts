import { lt, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { rateLimitBucket } from "../db/schema";

export interface RateRule {
  /** Window length in seconds. */
  window: number;
  max: number;
}

export interface RateResult {
  allowed: boolean;
  count: number;
  retryAfterSeconds: number;
}

/**
 * Fixed-window counter in MariaDB. One atomic upsert per hit, so concurrent requests cannot
 * slip past the limit. `key` must not contain raw personal data (hash emails first).
 */
/** `retainSeconds` keeps a bucket past its window (the 24-hour mail cap sums hourly buckets). */
export async function consume(key: string, rule: RateRule, now = Date.now(), retainSeconds = 0): Promise<RateResult> {
  if (key.length > 191) throw new Error("rate-limit key too long");
  const windowMs = rule.window * 1000;
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const expiresAt = new Date(windowStart + windowMs + retainSeconds * 1000);
  const db = getDb();
  await db
    .insert(rateLimitBucket)
    .values({ bucketKey: key, windowStart, count: 1, expiresAt })
    .onDuplicateKeyUpdate({ set: { count: sql`${rateLimitBucket.count} + 1` } });
  const [row] = await db
    .select({ count: rateLimitBucket.count })
    .from(rateLimitBucket)
    .where(sql`${rateLimitBucket.bucketKey} = ${key} AND ${rateLimitBucket.windowStart} = ${windowStart}`);
  const count = row?.count ?? 1;
  return {
    allowed: count <= rule.max,
    count,
    retryAfterSeconds: Math.max(0, Math.ceil((windowStart + windowMs - now) / 1000)),
  };
}

/** Nightly cleanup (called by the cron route in Phase 4e). */
export async function purgeExpiredBuckets(now = new Date()) {
  await getDb().delete(rateLimitBucket).where(lt(rateLimitBucket.expiresAt, now));
}

/** Limits that sit outside Better Auth. Values from architecture §8.1 and the 4a email cap. */
export const LIMITS = {
  /** Verification or reset emails to one address. */
  emailPerAddress: { window: 3600, max: 3 },
} as const satisfies Record<string, RateRule>;
