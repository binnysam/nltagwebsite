import { lt, sql, type SQL } from "drizzle-orm";
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

/**
 * Progressive-delay throttle (sign-in protection, docs/backend/data-and-auth.md → "Sign-in
 * protection"). Unlike a fixed window it never blocks indefinitely and has no window boundary:
 * - the first `free` attempts of an episode pass immediately;
 * - attempt n > free must wait `min(cap, base · 2^(n−free−1))` seconds after the previous counted one;
 * - the episode ends `resetSeconds` after the last counted attempt (no attempt counted since).
 *
 * Stored in rate_limit_bucket with window_start = 0 (a single row per key): `count` is the number
 * of counted attempts in the episode, `expires_at` = last counted attempt + resetSeconds. So the
 * nightly purge removes finished episodes, and no migration is needed.
 */
export interface ThrottleRule {
  /** Attempts allowed at once before any delay (also the ceiling for a concurrent burst). */
  free: number;
  /** First delay, in seconds, after the free attempts are used. Doubles each time. */
  baseDelay: number;
  /** Longest delay between attempts, in seconds. */
  maxDelay: number;
  /** An episode ends after this many seconds with no counted attempt. Must exceed maxDelay. */
  resetSeconds: number;
}

/** Seconds that attempt number `count + 1` must wait after the previous counted attempt. */
export function throttleDelaySeconds(count: number, rule: ThrottleRule): number {
  if (count < rule.free) return 0;
  return Math.min(rule.maxDelay, rule.baseDelay * 2 ** (count - rule.free));
}

export interface ReserveResult {
  allowed: boolean;
  /** Attempts counted in this episode after this call (unchanged when refused). */
  count: number;
  /** When refused: seconds until the next attempt can be counted. */
  retryAfterSeconds: number;
}

const THROTTLE_ROW = 0;

/**
 * reserveAttempt() and reserveWindow() write their row with INSERT IGNORE and count with a
 * conditional UPDATE. If the purge deletes the (already expired) row between the two, the UPDATE
 * finds nothing; they then re-insert and retry, at most this many rounds in all, then refuse.
 */
const VANISHED_ROW_ATTEMPTS = 3;

/**
 * Reserves one attempt atomically, BEFORE the guarded work (a password check) runs. A single
 * conditional UPDATE decides: under the row lock it either counts the attempt (and the caller may
 * proceed) or changes nothing (refused). Concurrent callers therefore cannot exceed the schedule:
 * a burst of any size gets exactly `free` reservations. Undo a reservation with releaseAttempt
 * when the guarded work turns out not to be a failure.
 */
export async function reserveAttempt(key: string, rule: ThrottleRule, now = Date.now()): Promise<ReserveResult> {
  if (key.length > 191) throw new Error("rate-limit key too long");
  if (rule.resetSeconds <= rule.maxDelay) throw new Error("throttle reset must exceed the maximum delay");
  const db = getDb();
  const nowAt = new Date(now);
  const resetMs = rule.resetSeconds * 1000;
  // delay(count) in ms, in SQL so the decision happens under the row lock. Free attempts pass on the
  // count alone: concurrent callers read the clock in a slightly different order than they get the
  // lock, and a millisecond must never turn a free attempt into a refusal.
  const delayMs = sql`IF(count < ${rule.free}, 0, LEAST(${rule.maxDelay * 1000}, ${rule.baseDelay * 1000} * POW(2, count - ${rule.free})))`;
  let result: { affectedRows: number } = { affectedRows: 0 };
  let row: { count: number; expiresAt: Date } | undefined;
  for (let attempt = 1; attempt <= VANISHED_ROW_ATTEMPTS; attempt++) {
    // First sight of the key: an already-finished episode, so the UPDATE below starts a new one.
    await db.execute(sql`INSERT IGNORE INTO rate_limit_bucket (bucket_key, window_start, count, expires_at) VALUES (${key}, ${THROTTLE_ROW}, 0, ${nowAt})`);
    [result] = (await db.execute(sql`
      UPDATE rate_limit_bucket
         SET count = IF(expires_at <= ${nowAt}, 1, count + 1),
             expires_at = ${new Date(now + resetMs)}
       WHERE bucket_key = ${key} AND window_start = ${THROTTLE_ROW}
         AND (expires_at <= ${nowAt}
              OR count < ${rule.free}
              OR TIMESTAMPADD(MICROSECOND, (${delayMs}) * 1000, expires_at) <= ${new Date(now + resetMs)})`)) as unknown as [{ affectedRows: number }];
    [row] = await db
      .select({ count: rateLimitBucket.count, expiresAt: rateLimitBucket.expiresAt })
      .from(rateLimitBucket)
      .where(sql`${rateLimitBucket.bucketKey} = ${key} AND ${rateLimitBucket.windowStart} = ${THROTTLE_ROW}`);
    // Purge race: the opportunistic purge deleted the row between the INSERT and the UPDATE (it is
    // purgeable only once its episode has ended). A refusal always leaves a row, so "no row" means
    // nothing was decided: write it again and retry. Bounded; if it keeps vanishing, refuse.
    if (result.affectedRows === 1 || row) break;
  }
  const count = row?.count ?? 0;
  if (result.affectedRows === 1) return { allowed: true, count, retryAfterSeconds: 0 };
  const lastAt = (row?.expiresAt?.getTime() ?? now) - resetMs;
  const delay = throttleDelaySeconds(count, rule);
  // Clamped to the delay itself: a concurrent caller whose clock reading predates the last counted
  // attempt must not get a different answer (identical responses for every address).
  const waitSeconds = Math.ceil((lastAt + delay * 1000 - now) / 1000);
  return { allowed: false, count, retryAfterSeconds: Math.min(delay, Math.max(1, waitSeconds)) };
}

/**
 * True for exactly one caller per key and fixed window, however many arrive at once (INSERT IGNORE
 * succeeds once). Later callers only increment the counter, so a flood costs one row, not one per
 * call. Used to bound audit rows and alert emails (L3).
 */
export async function claimOncePerWindow(key: string, rule: RateRule, now = Date.now()): Promise<boolean> {
  if (key.length > 191) throw new Error("rate-limit key too long");
  const windowMs = rule.window * 1000;
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const db = getDb();
  const [inserted] = (await db.execute(
    sql`INSERT IGNORE INTO rate_limit_bucket (bucket_key, window_start, count, expires_at) VALUES (${key}, ${windowStart}, 1, ${new Date(windowStart + windowMs)})`,
  )) as unknown as [{ affectedRows: number }];
  if (inserted.affectedRows === 1) return true;
  await db.execute(sql`UPDATE rate_limit_bucket SET count = count + 1 WHERE bucket_key = ${key} AND window_start = ${windowStart}`);
  return false;
}

/** Gives back one reservation (the guarded work was not a failure). Never goes below zero. */
export async function releaseAttempt(key: string): Promise<void> {
  await getDb().execute(sql`UPDATE rate_limit_bucket SET count = IF(count > 0, count - 1, 0) WHERE bucket_key = ${key} AND window_start = ${THROTTLE_ROW}`);
}


/**
 * Fixed-window reservation (R4, F11): one conditional statement counts this call only while the
 * window still has room, so a concurrent burst of any size gets exactly `max` reservations (unlike
 * consume(), which counts refused calls too and lets a burst burn the whole window). Returns the
 * window it reserved in, so releaseWindow() gives back exactly that slot.
 */
export interface WindowReservation {
  allowed: boolean;
  windowStart: number;
  retryAfterSeconds: number;
}

export async function reserveWindow(key: string, rule: RateRule, now = Date.now()): Promise<WindowReservation> {
  if (key.length > 191) throw new Error("rate-limit key too long");
  const windowMs = rule.window * 1000;
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const db = getDb();
  let allowed = false;
  for (let attempt = 1; attempt <= VANISHED_ROW_ATTEMPTS; attempt++) {
    await db.execute(sql`INSERT IGNORE INTO rate_limit_bucket (bucket_key, window_start, count, expires_at) VALUES (${key}, ${windowStart}, 0, ${new Date(windowStart + windowMs)})`);
    const [result] = (await db.execute(
      sql`UPDATE rate_limit_bucket SET count = count + 1 WHERE bucket_key = ${key} AND window_start = ${windowStart} AND count < ${rule.max}`,
    )) as unknown as [{ affectedRows: number }];
    allowed = result.affectedRows === 1;
    if (allowed) break;
    // A full window leaves its row; "no row" means the purge removed it at the window boundary
    // between the INSERT and the UPDATE (purge race, see VANISHED_ROW_ATTEMPTS): retry.
    const [rows] = (await db.execute(sql`SELECT 1 AS present FROM rate_limit_bucket WHERE bucket_key = ${key} AND window_start = ${windowStart}`)) as unknown as [unknown[]];
    if (rows.length > 0) break;
  }
  return { allowed, windowStart, retryAfterSeconds: Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000)) };
}

/** Gives back one reservation in the window reserveWindow() returned. Never below zero. */
export async function releaseWindow(key: string, windowStart: number): Promise<void> {
  await getDb().execute(sql`UPDATE rate_limit_bucket SET count = IF(count > 0, count - 1, 0) WHERE bucket_key = ${key} AND window_start = ${windowStart}`);
}

/**
 * Opportunistic cleanup of expired rows (R4), primary-key batches (owner decision 4 Nov 2026;
 * docs/backend/data-and-auth.md → "Sign-in protection" → "Purge without deadlocks").
 *
 * The old purge, `DELETE … WHERE expires_at < ? LIMIT 5000`, scanned rate_limit_bucket_expires_idx
 * and so locked index entries before rows, while reserveAttempt()'s UPDATE locks the row (primary
 * key) and then its expires_at index entry. Opposite orders: MariaDB could cancel either statement
 * with ER_LOCK_DEADLOCK (1213), which turned a sign-in into an error. Now:
 *  1. a plain SELECT (consistent read, no locks) picks at most `batch` keys of expired rows;
 *  2. one short READ COMMITTED transaction deletes exactly those keys through the PRIMARY index
 *     (forced: the optimizer otherwise picks the expires_at index for this statement too, which
 *     keeps the bad order) and re-checks `expires_at < cutoff`, so a row a reserve refreshed in
 *     between (a new episode) is kept. Same lock order as the reserve statements, no gap locks.
 * Cutoff, rows per run and schedule are unchanged: `expires_at < now`, at most 5,000 rows per run
 * (now in batches of 500), at most once a minute per process, started fire-and-forget by the gate.
 */
export const BUCKET_PURGE = {
  /** At most one run per process per interval. */
  intervalMs: 60_000,
  /** Rows per primary-key batch (one SELECT + one DELETE transaction). */
  batch: 500,
  /** Rows per run, all batches together. */
  maxRowsPerRun: 5000,
} as const;

export interface BucketKey {
  bucketKey: string;
  windowStart: number;
}

/** Keys of rows that expired before `cutoff`, oldest first. Plain SELECT: a non-locking read. */
export async function selectExpiredBucketKeys(cutoff: Date, limit: number = BUCKET_PURGE.batch): Promise<BucketKey[]> {
  const n = Math.max(1, Math.min(BUCKET_PURGE.batch, Math.floor(limit)));
  const [rows] = (await getDb().execute(
    sql`SELECT bucket_key, window_start FROM rate_limit_bucket WHERE expires_at < ${cutoff} ORDER BY expires_at LIMIT ${n}`,
  )) as unknown as [Array<{ bucket_key: string; window_start: number | string }>];
  return rows.map((r) => ({ bucketKey: r.bucket_key, windowStart: Number(r.window_start) }));
}

/**
 * The DELETE for one batch: exactly these keys, through the PRIMARY index, only while still
 * expired. Multi-table form because MariaDB accepts index hints on it (not on a single-table
 * DELETE). Exported so the integration test can EXPLAIN the statement that actually runs.
 */
export function expiredBucketDeleteSql(keys: readonly BucketKey[], cutoff: Date): SQL {
  if (keys.length === 0 || keys.length > BUCKET_PURGE.batch) throw new Error("rate-limit purge batch size out of range");
  const list = sql.join(
    keys.map((k) => sql`(${k.bucketKey}, ${k.windowStart})`),
    sql`, `,
  );
  return sql`DELETE t FROM rate_limit_bucket AS t FORCE INDEX (PRIMARY) WHERE (t.bucket_key, t.window_start) IN (${list}) AND t.expires_at < ${cutoff}`;
}

/** Deletes one batch in its own READ COMMITTED transaction (no gap locks). Returns rows deleted. */
export async function deleteExpiredBucketsByKey(keys: readonly BucketKey[], cutoff: Date): Promise<number> {
  if (keys.length === 0) return 0;
  const statement = expiredBucketDeleteSql(keys, cutoff);
  return getDb().transaction(
    async (tx) => {
      const [r] = (await tx.execute(statement)) as unknown as [{ affectedRows: number }];
      return r.affectedRows;
    },
    { isolationLevel: "read committed" },
  );
}

/** One bounded run: batches of BUCKET_PURGE.batch until `maxRows` keys were processed or none are left. */
export async function purgeExpiredBucketsBatched(now: number, maxRows: number = BUCKET_PURGE.maxRowsPerRun): Promise<number> {
  const cutoff = new Date(now);
  let remaining = Math.max(0, Math.min(BUCKET_PURGE.maxRowsPerRun, Math.floor(maxRows)));
  let deleted = 0;
  while (remaining > 0) {
    const want = Math.min(BUCKET_PURGE.batch, remaining);
    const keys = await selectExpiredBucketKeys(cutoff, want);
    if (keys.length === 0) break;
    deleted += await deleteExpiredBucketsByKey(keys, cutoff);
    // Counted by keys processed, not rows deleted: a run always ends after at most
    // maxRows / batch batches, even if reserves keep refreshing the selected rows.
    remaining -= keys.length;
    if (keys.length < want) break;
  }
  return deleted;
}

/**
 * The gate calls this on its requests (never awaited); it deletes at most `batch` expired rows,
 * at most once a minute per process, so a flood of unique addresses cannot grow the table without
 * bound. `batch` is the per-run maximum (default 5,000), deleted in primary-key batches of 500.
 */
let lastPurge = 0;
export async function purgeExpiredBucketsSometimes(now = Date.now(), batch: number = BUCKET_PURGE.maxRowsPerRun): Promise<number> {
  if (now - lastPurge < BUCKET_PURGE.intervalMs) return 0;
  lastPurge = now;
  return purgeExpiredBucketsBatched(now, batch);
}

/**
 * Nightly cleanup (called by the cron route in Phase 4e). Not called anywhere yet. It is still an
 * unbounded range DELETE on expires_at, the lock order that deadlocked against the reserves; wire
 * up purgeExpiredBucketsBatched() instead before scheduling anything.
 */
export async function purgeExpiredBuckets(now = new Date()) {
  await getDb().delete(rateLimitBucket).where(lt(rateLimitBucket.expiresAt, now));
}

/** Limits that sit outside Better Auth. Values from architecture §8.1 and the 4a email cap. */
export const LIMITS = {
  /** Verification or reset emails to one address. */
  emailPerAddress: { window: 3600, max: 3 },
  /** Requests through /api/auth/request-password-reset per address (all addresses alike). */
  resetRequestPerAddress: { window: 15 * 60, max: 5 },
  /**
   * Account requests that reach provisioning, per listed address (decided after the reply).
   * v6.1 §1: 3 per 15 min — each provisioned request issues a link, and mail is capped at 3 per
   * address per hour, so the first window issues exactly as many links as can be delivered.
   */
  accountRequestPerAddress: { window: 15 * 60, max: 3 },
  /** Audit rows for refused sign-ins: at most one per account per hour (the refusals still count). */
  signInRefusalAudit: { window: 3600, max: 1 },
  /** Email to an account holder whose account is being throttled: at most one per day. */
  signInAlertEmail: { window: 24 * 3600, max: 1 },
} as const satisfies Record<string, RateRule>;

/**
 * Password checks per account (keyed by an HMAC of the address, never the address), whatever IP
 * they come from. Reserved BEFORE the password is checked, released when it was not a wrong
 * password. Applies equally to addresses with no account. About 100 checks per day at most.
 *  - Unrecognised browsers share `signInAccount`; a delay there is the only thing an attacker can
 *    cause, and it never becomes an indefinite block.
 *  - A recognised browser (src/server/auth/recognised-browser.ts) has its own budget with the same
 *    schedule, so attacks on the shared budget cannot lock the account holder out of it.
 */
export const THROTTLES = {
  signInAccount: { free: 5, baseDelay: 30, maxDelay: 15 * 60, resetSeconds: 3 * 3600 },
  signInRecognisedBrowser: { free: 5, baseDelay: 30, maxDelay: 15 * 60, resetSeconds: 3 * 3600 },
} as const satisfies Record<string, ThrottleRule>;

/** Bucket key for THROTTLES.signInAccount. `emailHash` is hashEmail(address). */
export const signInAccountKey = (emailHash: string) => `signin-acct:${emailHash}`;
/** Bucket key for THROTTLES.signInRecognisedBrowser. `browserId` is the cookie's random id. */
export const signInBrowserKey = (browserId: string) => `signin-dev:${browserId}`;
