import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { sql, type SQL } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb, getPool } from "@/server/db/client";
import {
  BUCKET_PURGE,
  expiredBucketDeleteSql,
  LIMITS,
  purgeExpiredBucketsBatched,
  purgeExpiredBucketsSometimes,
  reserveAttempt,
  selectExpiredBucketKeys,
  THROTTLES,
  type BucketKey,
} from "@/server/services/rate-limit";
import { clearRateLimits } from "./helpers";

/**
 * rate_limit_bucket purge in primary-key batches (owner decision 4 Nov 2026; docs/backend/
 * data-and-auth.md → "Sign-in protection" → "Purge without deadlocks").
 *
 * The former purge (`DELETE … WHERE expires_at < ? LIMIT 5000`) locked the expires_at index before
 * the rows; reserveAttempt()'s UPDATE locks the row, then its index entry. MariaDB cancelled one of
 * them with ER_LOCK_DEADLOCK (1213), and a cancelled reserve turned a sign-in into an error. These
 * tests pin the replacement: the query plan (PRIMARY, checked on the CI engine, MariaDB 11.8.9),
 * what it deletes and keeps, its bounds and schedule, and, across processes, zero deadlocks with
 * every reservation counted exactly once (plus a control run with the former statement).
 */
const RULE = THROTTLES.signInAccount;
type Db = ReturnType<typeof getDb>;
const toQuery = (db: Db, q: SQL) => (db as unknown as { dialect: { sqlToQuery(s: SQL): { sql: string; params: unknown[] } } }).dialect.sqlToQuery(q);

/** Inserts `n` rows `${prefix}${i}` (window 0) with the given expiry and count. */
async function seed(prefix: string, n: number, expiresAt: (i: number) => Date, count = 1, windowStart = 0) {
  for (let from = 0; from < n; from += 1000) {
    const values = Array.from({ length: Math.min(1000, n - from) }, (_, j) => sql`(${`${prefix}${from + j}`}, ${windowStart}, ${count}, ${expiresAt(from + j)})`);
    await getDb().execute(sql`INSERT INTO rate_limit_bucket (bucket_key, window_start, count, expires_at) VALUES ${sql.join(values, sql`, `)}`);
  }
}

async function countRows(likePattern: string) {
  const [[row]] = (await getDb().execute(sql`SELECT COUNT(*) AS n FROM rate_limit_bucket WHERE bucket_key LIKE ${likePattern}`)) as unknown as [[{ n: number }]];
  return Number(row.n);
}

async function explain(statement: SQL) {
  const [rows] = (await getDb().execute(sql`EXPLAIN ${statement}`)) as unknown as [
    Array<{ table: string | null; type: string | null; key: string | null; possible_keys: string | null; Extra: string | null }>,
  ];
  return rows;
}

/** Records the LIMIT of every key-selecting SELECT the purge sends; optional hook after the first. */
function watchSelects(afterFirst?: () => Promise<void>) {
  const db = getDb();
  const original = db.execute.bind(db);
  const limits: number[] = [];
  vi.spyOn(db, "execute").mockImplementation((async (q: SQL) => {
    const result = await original(q);
    const { sql: text, params } = toQuery(db, q);
    if (/^\s*SELECT bucket_key, window_start FROM rate_limit_bucket WHERE expires_at/i.test(text)) {
      limits.push(Number(params[params.length - 1]));
      if (limits.length === 1 && afterFirst) await afterFirst();
    }
    return result;
  }) as typeof db.execute);
  return limits;
}

beforeEach(clearRateLimits);
afterEach(() => vi.restoreAllMocks());
afterAll(closeDb);

describe("query plan guard (the CI engine is MariaDB 11.8.9)", () => {
  it("the batch DELETE runs on the PRIMARY index: empty table, 6,000 rows, after ANALYZE, 1 and 500 keys", async () => {
    const [[{ version }]] = (await getDb().execute(sql`SELECT VERSION() AS version`)) as unknown as [[{ version: string }]];
    const cutoff = new Date();
    const keysOf = (n: number): BucketKey[] => Array.from({ length: n }, (_, i) => ({ bucketKey: `plan:old:${i}`, windowStart: 0 }));
    // [label, set-up, rows exist]. On an empty table MariaDB reads no index at all ("no matching
    // rows"), so nothing can be locked; once rows exist the table must be read, through PRIMARY.
    const states: Array<[string, () => Promise<void>, boolean]> = [
      ["empty table", async () => {}, false],
      [
        "3,000 expired + 3,000 live rows",
        async () => {
          await seed("plan:old:", 3000, (i) => new Date(cutoff.getTime() - 3600_000 - i * 1000));
          await seed("plan:live:", 3000, (i) => new Date(cutoff.getTime() + 3600_000 + i * 1000));
        },
        true,
      ],
      ["after ANALYZE TABLE", async () => void (await getDb().execute(sql`ANALYZE TABLE rate_limit_bucket`)), true],
    ];
    for (const [label, setUp, hasRows] of states) {
      await setUp();
      for (const n of [1, BUCKET_PURGE.batch]) {
        const plan = await explain(expiredBucketDeleteSql(keysOf(n), cutoff));
        console.info("rate_limit_bucket purge plan", JSON.stringify({ version, state: label, keys: n, plan: plan.map((p) => ({ table: p.table, type: p.type, key: p.key, extra: p.Extra })) }));
        const reads = plan.filter((p) => p.table !== null);
        if (hasRows) expect(reads.length).toBeGreaterThan(0);
        else expect(plan.every((p) => p.table !== null || p.key === null)).toBe(true);
        for (const step of reads) expect(step.key).toBe("PRIMARY");
      }
    }
    // For the record (not asserted): without the hint the optimizer may choose the expires_at
    // index for the same statement, which is the lock order that deadlocked.
    const list = sql.join(keysOf(BUCKET_PURGE.batch).map((k) => sql`(${k.bucketKey}, ${k.windowStart})`), sql`, `);
    const unhinted = await explain(sql`DELETE FROM rate_limit_bucket WHERE (bucket_key, window_start) IN (${list}) AND expires_at < ${cutoff}`);
    const legacy = await explain(sql`DELETE FROM rate_limit_bucket WHERE expires_at < ${cutoff} LIMIT 5000`);
    console.info("rate_limit_bucket unhinted plans (informational)", JSON.stringify({ version, unhinted: unhinted.map((p) => p.key), legacy: legacy.map((p) => p.key) }));
  });

  it("the key SELECT is a non-locking read: a row locked by another transaction does not block it", async () => {
    await seed("lockread:", 3, () => new Date(Date.now() - 3600_000));
    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();
      await conn.query("SELECT * FROM rate_limit_bucket WHERE bucket_key = 'lockread:1' AND window_start = 0 FOR UPDATE");
      const keys = await Promise.race([
        selectExpiredBucketKeys(new Date()),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("key SELECT blocked by a row lock")), 3000)),
      ]);
      expect(keys.map((k) => k.bucketKey).sort()).toEqual(["lockread:0", "lockread:1", "lockread:2"]);
    } finally {
      await conn.rollback();
      conn.release();
    }
  });

  it("each batch DELETE runs in its own READ COMMITTED transaction", async () => {
    await seed("rc:", 3, () => new Date(Date.now() - 3600_000));
    const db = getDb();
    const tx = vi.spyOn(db, "transaction");
    expect(await purgeExpiredBucketsBatched(Date.now())).toBe(3);
    expect(tx).toHaveBeenCalledTimes(1);
    expect(tx.mock.calls[0]?.[1]).toEqual({ isolationLevel: "read committed" });
  });
});

describe("what the purge deletes and keeps", () => {
  it("deletes only rows with expires_at before the cutoff; live, retained and boundary rows stay", async () => {
    const now = Date.now();
    await seed("edge:before:", 1, () => new Date(now - 1));
    await seed("edge:at:", 1, () => new Date(now)); // not < cutoff
    await seed("edge:after:", 1, () => new Date(now + 1));
    await seed("edge:episode:", 1, () => new Date(now + RULE.resetSeconds * 1000), 5); // live sign-in episode
    await seed("edge:window:", 1, () => new Date(now + 600_000), 3, Math.floor(now / 900_000) * 900_000); // live window
    await seed("edge:mailcap:", 1, () => new Date(now + 23 * 3600_000), 7, Math.floor(now / 3600_000) * 3600_000 - 3600_000); // retained (24 h cap)
    expect(await purgeExpiredBucketsBatched(now)).toBe(1);
    const [rows] = (await getDb().execute(sql`SELECT bucket_key, count FROM rate_limit_bucket ORDER BY bucket_key`)) as unknown as [Array<{ bucket_key: string; count: number }>];
    expect(rows.map((r) => [r.bucket_key, Number(r.count)])).toEqual([
      ["edge:after:0", 1],
      ["edge:at:0", 1],
      ["edge:episode:0", 5],
      ["edge:mailcap:0", 7],
      ["edge:window:0", 3],
    ]);
  });

  it("a row a reserve refreshes between the SELECT and the DELETE is kept, with its new episode", async () => {
    const now = Date.now();
    await seed("refresh:", 3, () => new Date(now - 4 * 3600_000), 9); // three finished episodes
    const limits = watchSelects(async () => {
      // The address comes back while the purge holds its key list: a new episode starts.
      expect(await reserveAttempt("refresh:1", RULE, now)).toEqual({ allowed: true, count: 1, retryAfterSeconds: 0 });
    });
    expect(await purgeExpiredBucketsBatched(now)).toBe(2);
    expect(limits[0]).toBe(BUCKET_PURGE.batch);
    vi.restoreAllMocks();
    const [rows] = (await getDb().execute(sql`SELECT bucket_key, count, expires_at FROM rate_limit_bucket`)) as unknown as [Array<{ bucket_key: string; count: number; expires_at: Date }>];
    expect(rows.map((r) => ({ key: r.bucket_key, count: Number(r.count), expiresAt: new Date(r.expires_at).getTime() }))).toEqual([
      { key: "refresh:1", count: 1, expiresAt: now + RULE.resetSeconds * 1000 },
    ]);
    // The episode continues normally: 4 more free attempts, then the 30 s delay.
    for (let i = 2; i <= 5; i++) expect((await reserveAttempt("refresh:1", RULE, now)).allowed).toBe(true);
    expect(await reserveAttempt("refresh:1", RULE, now)).toEqual({ allowed: false, count: 5, retryAfterSeconds: 30 });
  });

  it("works in batches of 500: 1,234 expired rows → 3 batches, all deleted, live rows untouched", async () => {
    const now = Date.now();
    await seed("batch:old:", 1234, (i) => new Date(now - 1000 - i));
    await seed("batch:live:", 50, () => new Date(now + 3600_000));
    const limits = watchSelects();
    expect(await purgeExpiredBucketsBatched(now)).toBe(1234);
    expect(limits).toEqual([500, 500, 500]);
    expect(await countRows("batch:old:%")).toBe(0);
    expect(await countRows("batch:live:%")).toBe(50);
  });

  it("at most 5,000 rows per run (10 batches of 500), at most one run a minute per process", async () => {
    const t = Date.now() + 10 * 60_000; // after any run earlier in this file
    await seed("cap:", 6000, (i) => new Date(Date.now() - 1000 - i));
    const limits = watchSelects();
    expect(await purgeExpiredBucketsSometimes(t)).toBe(5000);
    expect(limits).toEqual(Array(10).fill(500));
    expect(await purgeExpiredBucketsSometimes(t + 59_999)).toBe(0); // within the minute: nothing runs
    expect(limits).toHaveLength(10);
    expect(await countRows("cap:%")).toBe(1000);
    expect(await purgeExpiredBucketsSometimes(t + 60_000)).toBe(1000);
    expect(await countRows("cap:%")).toBe(0);
  });

  it("the bounds cannot be raised by a caller", async () => {
    const now = Date.now();
    await seed("bound:", 6000, () => new Date(now - 1000));
    expect((await selectExpiredBucketKeys(new Date(now), 100_000)).length).toBe(500);
    expect(await purgeExpiredBucketsBatched(now, 100_000)).toBe(5000);
    const key = { bucketKey: "x", windowStart: 0 };
    expect(() => expiredBucketDeleteSql([], new Date(now))).toThrow();
    expect(() => expiredBucketDeleteSql(Array(501).fill(key), new Date(now))).toThrow();
  });

  it("purge settings and every rate limit are the approved values (unchanged by this change)", () => {
    expect(BUCKET_PURGE).toEqual({ intervalMs: 60_000, batch: 500, maxRowsPerRun: 5000 });
    expect(THROTTLES).toEqual({
      signInAccount: { free: 5, baseDelay: 30, maxDelay: 900, resetSeconds: 10_800 },
      signInRecognisedBrowser: { free: 5, baseDelay: 30, maxDelay: 900, resetSeconds: 10_800 },
    });
    expect(LIMITS).toEqual({
      emailPerAddress: { window: 3600, max: 3 },
      resetRequestPerAddress: { window: 900, max: 5 },
      accountRequestPerAddress: { window: 900, max: 3 },
      signInRefusalAudit: { window: 3600, max: 1 },
      signInAlertEmail: { window: 86_400, max: 1 },
    });
  });
});

/**
 * Separate Node processes (own pool of 5 connections each, like Hostinger workers): 4 run
 * sign-in-shaped reservations for 8 s (new addresses, 40 addresses returning after their reset,
 * new windows, one shared address) while a fifth runs the purge back to back, far more often than
 * production's once a minute per process. Deadlocks are counted in every process.
 */
const WORKER = fileURLToPath(new URL("./support/rate-limit-worker.ts", import.meta.url));
const PROCESSES = 4;
const RUN_MS = 8000;
const BACK = 40;

interface MixResult {
  calls: number;
  deadlocks: number;
  deadlockStatements: { insert: number; update: number; other: number };
  otherErrors: string[];
  fresh: { allowed: number; refused: number };
  freshWindow: { allowed: number; refused: number };
  back: Record<string, number>;
  shared: number;
}
interface PurgeResult {
  runs: number;
  deleted: number;
  deadlocks: number;
  otherErrors: string[];
}

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

async function loadRun(prefix: string, variant: "pk" | "legacy") {
  const now = Date.now();
  await seed(`${prefix}:old:`, 3000, (i) => new Date(now - 2 * 3600_000 - i * 1000)); // a backlog to purge
  await seed(`${prefix}:back:`, BACK, () => new Date(now - 4 * 3600_000), 9); // finished episodes
  const startAt = Date.now() + 4000; // time for every child to start and connect
  const [purger, ...workers] = await Promise.all([
    runWorker<PurgeResult>("purge", { variant, startAt, ms: RUN_MS }),
    ...Array.from({ length: PROCESSES }, () => runWorker<MixResult>("mix", { key: prefix, startAt, ms: RUN_MS, lanes: 5, back: BACK })),
  ]);
  const sum = (f: (w: MixResult) => number) => workers.reduce((a, w) => a + f(w), 0);
  const back: Record<string, number> = {};
  for (const w of workers) for (const [k, n] of Object.entries(w.back)) back[k] = (back[k] ?? 0) + n;
  const summary = {
    variant,
    calls: sum((w) => w.calls),
    workerDeadlocks: sum((w) => w.deadlocks),
    deadlockedInsert: sum((w) => w.deadlockStatements.insert),
    deadlockedUpdate: sum((w) => w.deadlockStatements.update),
    purgeDeadlocks: purger.deadlocks,
    purgeRuns: purger.runs,
    purged: purger.deleted,
    freshAllowed: sum((w) => w.fresh.allowed),
    freshRefused: sum((w) => w.fresh.refused), // purge-race retries exhausted (fails closed)
    windowAllowed: sum((w) => w.freshWindow.allowed),
    windowRefused: sum((w) => w.freshWindow.refused),
    sharedAllowed: sum((w) => w.shared),
    otherErrors: [...purger.otherErrors, ...workers.flatMap((w) => w.otherErrors)],
  };
  console.info("rate_limit_bucket concurrency", JSON.stringify(summary));
  return { summary, back };
}

/** Every reservation that was allowed is counted exactly once, and nothing else is. */
async function expectExactCounts(prefix: string, run: Awaited<ReturnType<typeof loadRun>>) {
  const { summary, back } = run;
  const [dups] = (await getDb().execute(
    sql`SELECT bucket_key FROM rate_limit_bucket WHERE bucket_key LIKE ${`${prefix}:%`} GROUP BY bucket_key, window_start HAVING COUNT(*) > 1`,
  )) as unknown as [unknown[]];
  expect(dups).toEqual([]);
  const totals = async (like: string) => {
    const [[r]] = (await getDb().execute(
      sql`SELECT COALESCE(SUM(count), 0) AS total, COALESCE(MAX(count), 0) AS top FROM rate_limit_bucket WHERE bucket_key LIKE ${like}`,
    )) as unknown as [[{ total: number; top: number }]];
    return { total: Number(r.total), top: Number(r.top) };
  };
  expect(await totals(`${prefix}:new:%`)).toEqual({ total: summary.freshAllowed, top: summary.freshAllowed > 0 ? 1 : 0 });
  expect(await totals(`${prefix}:win:%`)).toEqual({ total: summary.windowAllowed, top: summary.windowAllowed > 0 ? 1 : 0 });
  expect(summary.sharedAllowed).toBeLessThanOrEqual(RULE.free);
  expect((await totals(`${prefix}:shared`)).total).toBe(summary.sharedAllowed);
  for (const [key, allowed] of Object.entries(back)) {
    expect(allowed).toBeLessThanOrEqual(RULE.free);
    expect((await totals(key)).total).toBe(allowed);
  }
}

describe("across processes with the purge running back to back", () => {
  it("primary-key purge: zero ER_LOCK_DEADLOCK, every allowed reservation counted exactly once", async () => {
    const run = await loadRun("conc", "pk");
    expect(run.summary.otherErrors).toEqual([]);
    expect(run.summary.workerDeadlocks).toBe(0);
    expect(run.summary.purgeDeadlocks).toBe(0);
    expect(run.summary.purged).toBeGreaterThanOrEqual(3000); // the purge really ran against the load
    expect(run.summary.freshAllowed).toBeGreaterThan(100);
    expect(run.summary.sharedAllowed).toBeGreaterThan(0);
    await expectExactCounts("conc", run);
  }, 60_000);

  it("control, the former range DELETE: deadlocks reported, counts still exact (a cancelled statement changes nothing)", async () => {
    const run = await loadRun("ctrl", "legacy");
    expect(run.summary.otherErrors).toEqual([]);
    await expectExactCounts("ctrl", run);
    // Whether a given run deadlocks is timing-dependent, so the count is logged, not asserted;
    // RL_REQUIRE_CONTROL_DEADLOCK=1 makes it an assertion for evidence runs.
    if (process.env.RL_REQUIRE_CONTROL_DEADLOCK === "1") expect(run.summary.workerDeadlocks + run.summary.purgeDeadlocks).toBeGreaterThan(0);
  }, 60_000);
});
