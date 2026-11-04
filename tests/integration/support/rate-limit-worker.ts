/**
 * Child process for tests/integration/rate-limit-purge-race.test.ts and rate-limit-pk-purge.test.ts:
 * a separate Node process with
 * its own connection pool and its own purge state, like a second Hostinger worker. Run with
 *   node --conditions=react-server --import tsx rate-limit-worker.ts <mode> <json>
 * Prints one JSON line with the results. Test data only (fictional bucket keys).
 *
 * Modes:
 *  - attempt: `calls` concurrent reserveAttempt() on `key` (or on `${key}:${i}` when `distinct`)
 *  - window:  `calls` concurrent reserveWindow() on `key`
 *  - mix:     for `ms`, `lanes` concurrent loops of sign-in-shaped reservations under `key`: a new
 *             address, an address returning after its reset (`back` pre-seeded keys), a new window,
 *             and one shared address. Deadlocks (1213) are counted, never thrown.
 *  - purge:   for `ms`, the purge back to back: `variant` "pk" (purgeExpiredBucketsBatched, without
 *             the once-a-minute guard) or "legacy" (the former range DELETE, the control).
 */
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "../../../src/server/db/client";
import { purgeExpiredBucketsBatched, reserveAttempt, reserveWindow, THROTTLES } from "../../../src/server/services/rate-limit";

const [mode, raw] = process.argv.slice(2);
const args = JSON.parse(raw ?? "{}") as {
  key: string;
  calls: number;
  distinct?: boolean;
  startAt: number;
  max?: number;
  window?: number;
  ms?: number;
  lanes?: number;
  back?: number;
  variant?: "pk" | "legacy";
};

/** Drizzle wraps driver errors; the MariaDB error is on `cause`. */
function isDeadlock(e: unknown): boolean {
  for (let x = e as { errno?: number; code?: string; cause?: unknown } | undefined, i = 0; x && i < 5; x = x.cause as typeof x, i++) {
    if (x.errno === 1213 || x.code === "ER_LOCK_DEADLOCK") return true;
  }
  return false;
}

async function mix() {
  const out = {
    calls: 0,
    deadlocks: 0,
    /** Which reserve statement MariaDB cancelled (evidence: purge/reserve vs reserve/reserve). */
    deadlockStatements: { insert: 0, update: 0, other: 0 },
    otherErrors: [] as string[],
    fresh: { allowed: 0, refused: 0 },
    freshWindow: { allowed: 0, refused: 0 },
    back: {} as Record<string, number>,
    shared: 0,
  };
  const end = Date.now() + (args.ms ?? 5000);
  const backKeys = args.back ?? 0;
  const lane = async (l: number) => {
    for (let i = 0; Date.now() < end; i++) {
      const op = i % 4;
      out.calls += 1;
      try {
        if (op === 0) {
          const r = await reserveAttempt(`${args.key}:new:${process.pid}:${l}:${i}`, THROTTLES.signInAccount);
          out.fresh[r.allowed ? "allowed" : "refused"] += 1;
        } else if (op === 1 && backKeys > 0) {
          const k = `${args.key}:back:${(i + l) % backKeys}`;
          if ((await reserveAttempt(k, THROTTLES.signInAccount)).allowed) out.back[k] = (out.back[k] ?? 0) + 1;
        } else if (op === 2) {
          const r = await reserveWindow(`${args.key}:win:${process.pid}:${l}:${i}`, { window: 900, max: 3 });
          out.freshWindow[r.allowed ? "allowed" : "refused"] += 1;
        } else {
          if ((await reserveAttempt(`${args.key}:shared`, THROTTLES.signInAccount)).allowed) out.shared += 1;
        }
      } catch (e) {
        if (isDeadlock(e)) {
          out.deadlocks += 1;
          const query = String((e as Error)?.message ?? "");
          out.deadlockStatements[/Failed query:\s*INSERT/i.test(query) ? "insert" : /Failed query:\s*UPDATE/i.test(query) ? "update" : "other"] += 1;
        } else out.otherErrors.push(String((e as Error)?.message ?? e).slice(0, 160));
      }
    }
  };
  await Promise.all(Array.from({ length: args.lanes ?? 5 }, (_, l) => lane(l)));
  return out;
}

async function purge() {
  const out = { runs: 0, deleted: 0, deadlocks: 0, otherErrors: [] as string[] };
  const end = Date.now() + (args.ms ?? 5000);
  while (Date.now() < end) {
    out.runs += 1;
    try {
      if (args.variant === "legacy") {
        const [r] = (await getDb().execute(sql`DELETE FROM rate_limit_bucket WHERE expires_at < ${new Date()} LIMIT 5000`)) as unknown as [{ affectedRows: number }];
        out.deleted += r.affectedRows;
      } else {
        out.deleted += await purgeExpiredBucketsBatched(Date.now());
      }
    } catch (e) {
      if (isDeadlock(e)) out.deadlocks += 1;
      else out.otherErrors.push(String((e as Error)?.message ?? e).slice(0, 160));
    }
  }
  return out;
}

async function main() {
  // Common start time so every process fires at the same moment.
  await new Promise((r) => setTimeout(r, Math.max(0, args.startAt - Date.now())));
  if (mode === "mix") return mix();
  if (mode === "purge") return purge();
  if (mode === "attempt") {
    const results = await Promise.all(
      Array.from({ length: args.calls }, (_, i) => reserveAttempt(args.distinct ? `${args.key}:${process.pid}:${i}` : args.key, THROTTLES.signInAccount)),
    );
    return { results };
  }
  if (mode === "window") {
    const rule = { window: args.window ?? 900, max: args.max ?? 3 };
    const results = await Promise.all(Array.from({ length: args.calls }, () => reserveWindow(args.key, rule)));
    return { results };
  }
  throw new Error(`unknown mode ${mode}`);
}

main()
  .then(async (out) => {
    process.stdout.write(`${JSON.stringify(out)}\n`);
    await closeDb();
  })
  .catch(async (e) => {
    process.stderr.write(`${String(e?.stack ?? e)}\ncause: ${String(e?.cause?.code ?? "")} ${String(e?.cause?.message ?? "")}\n`);
    await closeDb();
    process.exit(1);
  });
