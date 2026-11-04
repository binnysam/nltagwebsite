import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { log } from "../security/log";

/**
 * M1 option B (owner decision 4 Nov 2026; docs/backend/data-and-auth.md → "Verification cleanup").
 *
 * Better Auth 1.7.15 runs `DELETE FROM verification WHERE expires_at < ?` (a range delete on
 * verification_expires_idx) inside every findVerificationValue() call unless
 * `verification.disableCleanup` is set. On MariaDB 11.8.9 that range delete and the two-factor
 * consume transaction (identifier index → PK) take locks in opposite orders and can deadlock
 * (ER_LOCK_DEADLOCK, 1213). auth.ts now sets `disableCleanup: true`; this module does the
 * housekeeping instead, off the request path:
 *
 * - Only rows that expired more than GRACE ago (1 hour) are candidates. Every routed consumer
 *   enforces expiry itself (reset GET/POST compare expiresAt; consumeVerificationValue returns null
 *   for expired rows; the gate's liveResetToken checks expires_at), so keeping expired rows a while
 *   longer lets nothing through. A live row (expires_at in the future) is never a candidate.
 * - Primary-key deletion: a non-locking consistent read picks at most BATCH ids, then
 *   `DELETE … WHERE id IN (…) AND expires_at < cutoff` under READ COMMITTED. The delete re-checks
 *   the expiry, takes record locks on those (expired) rows only, no range or gap locks, so it never
 *   locks a row a live flow is using.
 * - At most once every 10 minutes per process, started fire-and-forget by the gate; no request
 *   ever waits for it. One run at a time. A failure (a deadlock included) is logged without data
 *   and retried at the next interval.
 */
export const VERIFICATION_PURGE = {
  intervalMs: 10 * 60 * 1000,
  graceMs: 60 * 60 * 1000,
  batch: 200,
} as const;

type IdRow = { id: string };

/** Ids of rows that expired before `cutoff`, oldest first. Plain SELECT: a non-locking read. */
export async function selectExpiredVerificationIds(cutoff: Date, batch: number = VERIFICATION_PURGE.batch): Promise<string[]> {
  const limit = Math.max(1, Math.min(VERIFICATION_PURGE.batch, Math.floor(batch)));
  const [rows] = (await getDb().execute(
    sql`SELECT id FROM verification WHERE expires_at < ${cutoff} ORDER BY expires_at LIMIT ${limit}`,
  )) as unknown as [IdRow[]];
  return rows.map((r) => r.id);
}

/**
 * Deletes the given ids, but only those still expired before `cutoff` (re-checked in the same
 * statement, so a row whose expiry was moved forward meanwhile is kept). READ COMMITTED: no gap
 * locks, and rows that do not match release their locks at once.
 */
export async function deleteExpiredVerificationsById(ids: readonly string[], cutoff: Date): Promise<number> {
  if (ids.length === 0) return 0;
  if (ids.length > VERIFICATION_PURGE.batch) throw new Error("verification purge batch too large");
  return getDb().transaction(
    async (tx) => {
      const [r] = (await tx.execute(
        sql`DELETE FROM verification WHERE id IN (${sql.join(
          ids.map((id) => sql`${id}`),
          sql`, `,
        )}) AND expires_at < ${cutoff}`,
      )) as unknown as [{ affectedRows: number }];
      return r.affectedRows;
    },
    { isolationLevel: "read committed" },
  );
}

/** One bounded pass: at most BATCH rows, all expired more than GRACE before `now`. */
export async function purgeExpiredVerifications(now: Date = new Date(), batch: number = VERIFICATION_PURGE.batch): Promise<number> {
  const cutoff = new Date(now.getTime() - VERIFICATION_PURGE.graceMs);
  const ids = await selectExpiredVerificationIds(cutoff, batch);
  return deleteExpiredVerificationsById(ids, cutoff);
}

let lastAttempt = Number.NEGATIVE_INFINITY;
let running: Promise<void> | null = null;

/**
 * Starts a purge if none ran in the last 10 minutes in this process and none is running. Returns
 * at once (never awaited by a request). The interval counts from the attempt, so a failure is
 * retried at the next interval, not on the next request.
 */
export function purgeExpiredVerificationsSometimes(now: number = Date.now()): void {
  if (running || now - lastAttempt < VERIFICATION_PURGE.intervalMs) return;
  lastAttempt = now;
  running = purgeExpiredVerifications(new Date(now))
    .then((deleted) => {
      if (deleted > 0) log("info", "auth.verification_purge", { deleted });
    })
    .catch((error: unknown) => {
      const e = error as { code?: unknown; errno?: unknown };
      log("warn", "auth.verification_purge_failed", {
        dbError: typeof e?.code === "string" ? e.code : undefined,
        errno: typeof e?.errno === "number" ? e.errno : undefined,
      });
    })
    .finally(() => {
      running = null;
    });
}

/** Tests: wait for a started purge, and reset the per-process schedule. */
export async function flushVerificationPurgeForTests(): Promise<void> {
  await running;
}
export function resetVerificationPurgeScheduleForTests(): void {
  lastAttempt = Number.NEGATIVE_INFINITY;
}
