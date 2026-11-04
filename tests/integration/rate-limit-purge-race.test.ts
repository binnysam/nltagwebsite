import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { sql, type SQL } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/server/db/client";
import { purgeExpiredBucketsSometimes, reserveAttempt, reserveWindow, THROTTLES, type ReserveResult, type WindowReservation } from "@/server/services/rate-limit";
import { clearRateLimits } from "./helpers";

/**
 * Purge race (found 4 Nov 2026 in the D16 two-process timing runs). reserveAttempt() and
 * reserveWindow() write a row with INSERT IGNORE and then count the attempt with a conditional
 * UPDATE. The opportunistic purge (purgeExpiredBucketsSometimes, started by every gated auth
 * request) deletes rows whose expires_at has passed. If it ran between the two statements, the
 * UPDATE found no row and a caller that should have been allowed got a refusal (429,
 * retryAfterSeconds 0). Three ways in:
 *   1. first sight of a key (the row is written already expired: an ended episode);
 *   2. a key coming back after its 3-hour reset (its old, expired row is still there);
 *   3. reserveWindow() at a window boundary (the window ends between the two statements).
 * The purge is run between the two statements deterministically by wrapping getDb().execute.
 */
const RULE = THROTTLES.signInAccount;
const WINDOW = { window: 900, max: 3 };
const WINDOW_MS = WINDOW.window * 1000;

type Db = ReturnType<typeof getDb>;
const toSql = (db: Db, q: SQL) => (db as unknown as { dialect: { sqlToQuery(s: SQL): { sql: string } } }).dialect.sqlToQuery(q).sql;

/**
 * Runs `afterInsert` right after each INSERT IGNORE into rate_limit_bucket, at most `times` times,
 * i.e. between reserve*()'s INSERT and its UPDATE. Returns the number of such INSERTs seen.
 */
function betweenInsertAndUpdate(afterInsert: () => Promise<number>, times = 1) {
  const db = getDb();
  const original = db.execute.bind(db);
  const seen = { inserts: 0, purged: 0 };
  vi.spyOn(db, "execute").mockImplementation((async (q: SQL) => {
    const result = await original(q);
    if (/^\s*INSERT IGNORE INTO rate_limit_bucket/i.test(toSql(db, q))) {
      seen.inserts += 1;
      if (seen.inserts <= times) seen.purged += await afterInsert();
    }
    return result;
  }) as typeof db.execute);
  return seen;
}

/** The purge statement itself, without the once-a-minute guard (for repeated purges). */
async function purgeAt(now: number) {
  const [r] = (await getDb().execute(sql`DELETE FROM rate_limit_bucket WHERE expires_at < ${new Date(now)} LIMIT 5000`)) as unknown as [{ affectedRows: number }];
  return r.affectedRows;
}

async function rowsFor(prefix: string) {
  const [rows] = (await getDb().execute(
    sql`SELECT bucket_key, window_start, count FROM rate_limit_bucket WHERE bucket_key LIKE ${`${prefix}%`} ORDER BY bucket_key, window_start`,
  )) as unknown as [Array<{ bucket_key: string; window_start: number; count: number }>];
  return rows.map((r) => ({ key: r.bucket_key, windowStart: Number(r.window_start), count: Number(r.count) }));
}

beforeEach(clearRateLimits);
afterEach(() => vi.restoreAllMocks());
afterAll(closeDb);

// Simulated clocks, increasing through the file so purgeExpiredBucketsSometimes()'s once-a-minute
// guard never skips a purge these tests rely on.
const T1 = Date.UTC(2032, 0, 1, 10);
const T2 = Date.UTC(2032, 0, 2, 10);
const W3 = Math.floor(Date.UTC(2032, 0, 3, 10) / WINDOW_MS) * WINDOW_MS;

describe("purge between INSERT and UPDATE (deterministic regressions)", () => {
  it("1. first sight of an address: the attempt is counted, not refused", async () => {
    const seen = betweenInsertAndUpdate(() => purgeExpiredBucketsSometimes(T1 + 1));
    const r = await reserveAttempt("race:first", RULE, T1);
    expect(seen.purged).toBe(1); // the purge really deleted the just-written row
    expect(r).toEqual({ allowed: true, count: 1, retryAfterSeconds: 0 });
    vi.restoreAllMocks();
    expect(await rowsFor("race:first")).toEqual([{ key: "race:first", windowStart: 0, count: 1 }]);
    // The episode then continues on the normal schedule: 4 more free attempts, then a 30 s delay.
    for (let i = 2; i <= 5; i++) expect(await reserveAttempt("race:first", RULE, T1)).toEqual({ allowed: true, count: i, retryAfterSeconds: 0 });
    expect(await reserveAttempt("race:first", RULE, T1)).toEqual({ allowed: false, count: 5, retryAfterSeconds: 30 });
  });

  it("2. an address returning after its 3-hour reset: a new episode starts, not a refusal", async () => {
    for (let i = 0; i < 5; i++) expect((await reserveAttempt("race:back", RULE, T2)).allowed).toBe(true);
    expect((await reserveAttempt("race:back", RULE, T2)).allowed).toBe(false);
    const back = T2 + RULE.resetSeconds * 1000 + 1000;
    const seen = betweenInsertAndUpdate(() => purgeExpiredBucketsSometimes(back + 1));
    const r = await reserveAttempt("race:back", RULE, back);
    expect(seen.purged).toBe(1);
    expect(r).toEqual({ allowed: true, count: 1, retryAfterSeconds: 0 });
    vi.restoreAllMocks();
    expect(await rowsFor("race:back")).toEqual([{ key: "race:back", windowStart: 0, count: 1 }]);
    for (let i = 2; i <= 5; i++) expect((await reserveAttempt("race:back", RULE, back)).allowed).toBe(true);
    expect(await reserveAttempt("race:back", RULE, back)).toEqual({ allowed: false, count: 5, retryAfterSeconds: 30 });
  });

  it("3. reserveWindow() at a window boundary: the reservation is made in its window, not refused", async () => {
    const last = W3 + WINDOW_MS - 1; // last millisecond of the window
    const seen = betweenInsertAndUpdate(() => purgeExpiredBucketsSometimes(W3 + WINDOW_MS + 1));
    const r = await reserveWindow("race:win", WINDOW, last);
    expect(seen.purged).toBe(1);
    expect(r).toEqual({ allowed: true, windowStart: W3, retryAfterSeconds: 1 });
    vi.restoreAllMocks();
    expect(await rowsFor("race:win")).toEqual([{ key: "race:win", windowStart: W3, count: 1 }]);
  });
});

describe("the retry never weakens a limit", () => {
  it("an active episode is not reset: a purge that leaves the row in place causes no retry", async () => {
    const t = Date.UTC(2032, 0, 4, 10);
    for (let i = 0; i < 5; i++) await reserveAttempt("keep:ep", RULE, t);
    const seen = betweenInsertAndUpdate(() => purgeAt(t)); // the purge's clock agrees with the caller's
    expect(await reserveAttempt("keep:ep", RULE, t + 1000)).toEqual({ allowed: false, count: 5, retryAfterSeconds: 29 });
    expect(seen).toEqual({ inserts: 1, purged: 0 });
    vi.restoreAllMocks();
    expect(await rowsFor("keep:ep")).toEqual([{ key: "keep:ep", windowStart: 0, count: 5 }]);
  });

  it("a full window is not reset: a purge that leaves the row in place causes no retry", async () => {
    const w = Math.floor(Date.UTC(2032, 0, 5, 10) / WINDOW_MS) * WINDOW_MS;
    for (let i = 0; i < 3; i++) expect((await reserveWindow("keep:win", WINDOW, w + 1)).allowed).toBe(true);
    const seen = betweenInsertAndUpdate(() => purgeAt(w + WINDOW_MS - 1));
    expect((await reserveWindow("keep:win", WINDOW, w + WINDOW_MS - 2)).allowed).toBe(false);
    expect(seen).toEqual({ inserts: 1, purged: 0 });
    vi.restoreAllMocks();
    expect(await rowsFor("keep:win")).toEqual([{ key: "keep:win", windowStart: w, count: 3 }]);
  });

  it("fails closed after a bounded number of retries if the row keeps vanishing", async () => {
    const t = Date.UTC(2032, 0, 6, 10);
    const a = betweenInsertAndUpdate(() => purgeAt(t + 1), Infinity);
    const r: ReserveResult = await reserveAttempt("gone:ep", RULE, t);
    expect(r.allowed).toBe(false);
    expect(a.inserts).toBe(3);
    vi.restoreAllMocks();
    const w = Math.floor(t / WINDOW_MS) * WINDOW_MS;
    const b = betweenInsertAndUpdate(() => purgeAt(w + WINDOW_MS + 1), Infinity);
    const s: WindowReservation = await reserveWindow("gone:win", WINDOW, w + WINDOW_MS - 1);
    expect(s.allowed).toBe(false);
    expect(b.inserts).toBe(3);
  });
});

/**
 * Separate Node processes (own connection pool and purge state each, like two Hostinger workers)
 * fire at the same moment: the retry must not let a burst past a limit or create a second row.
 * No purge runs concurrently here: whether it lands between INSERT and UPDATE is timing, which
 * the deterministic tests above control instead.
 */
const WORKER = fileURLToPath(new URL("./support/rate-limit-worker.ts", import.meta.url));

function runWorker<T>(mode: string, args: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--conditions=react-server", "--import", "tsx", WORKER, mode, JSON.stringify(args)], { env: process.env });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(JSON.parse(out.trim().split("\n").pop()!) as T) : reject(new Error(`worker ${mode} exited ${code}: ${err}`))));
  });
}

async function acrossProcesses<R>(mode: "attempt" | "window", args: Record<string, unknown>, processes = 4) {
  const startAt = Date.now() + 4000; // time for every child to start and connect
  const workers = await Promise.all(Array.from({ length: processes }, () => runWorker<{ results: R[] }>(mode, { ...args, startAt })));
  return workers.flatMap((w) => w.results);
}

describe("across processes", () => {
  it("one new address: exactly the free attempts pass, every refusal has a real wait, one row", async () => {
    const results = await acrossProcesses<ReserveResult>("attempt", { key: "proc:one", calls: 25 });
    expect(results).toHaveLength(100);
    expect(results.filter((r) => r.allowed)).toHaveLength(RULE.free);
    for (const r of results.filter((x) => !x.allowed)) expect(r.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(await rowsFor("proc:one")).toEqual([{ key: "proc:one", windowStart: 0, count: RULE.free }]);
  }, 60_000);

  it("an address returning after its reset (expired row present): exactly the free attempts pass again, one row", async () => {
    await getDb().execute(sql`INSERT INTO rate_limit_bucket (bucket_key, window_start, count, expires_at) VALUES ('proc:back', 0, 9, ${new Date(Date.now() - 1000)})`);
    const results = await acrossProcesses<ReserveResult>("attempt", { key: "proc:back", calls: 25 });
    expect(results.filter((r) => r.allowed)).toHaveLength(RULE.free);
    for (const r of results.filter((x) => !x.allowed)) expect(r.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(await rowsFor("proc:back")).toEqual([{ key: "proc:back", windowStart: 0, count: RULE.free }]);
  }, 60_000);

  it("many new addresses: every first attempt passes and each address has exactly one row", async () => {
    const results = await acrossProcesses<ReserveResult>("attempt", { key: "proc:many", calls: 150, distinct: true });
    expect(results).toHaveLength(600);
    expect(results.filter((r) => !r.allowed)).toEqual([]);
    const rows = await rowsFor("proc:many");
    expect(rows).toHaveLength(600);
    expect(new Set(rows.map((r) => r.key)).size).toBe(600);
    expect(rows.every((r) => r.count === 1)).toBe(true);
  }, 60_000);

  it("one window: exactly `max` reservations pass, one row", async () => {
    const results = await acrossProcesses<WindowReservation>("window", { key: "proc:win", calls: 25, ...WINDOW });
    const allowed = results.filter((r) => r.allowed);
    // A run that straddles a 15-minute boundary may use two windows; each gets at most `max`.
    const windows = new Set(allowed.map((r) => r.windowStart));
    expect(allowed.length).toBe(WINDOW.max * windows.size);
    const rows = await rowsFor("proc:win");
    expect(rows.every((r) => r.count === WINDOW.max)).toBe(true);
    expect(rows.length).toBeLessThanOrEqual(2);
  }, 60_000);
});
