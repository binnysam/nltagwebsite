/**
 * Child process for tests/integration/rate-limit-purge-race.test.ts: a separate Node process with
 * its own connection pool and its own purge state, like a second Hostinger worker. Run with
 *   node --conditions=react-server --import tsx rate-limit-worker.ts <mode> <json>
 * Prints one JSON line with the results. Test data only (fictional bucket keys).
 *
 * Modes:
 *  - attempt: `calls` concurrent reserveAttempt() on `key` (or on `${key}:${i}` when `distinct`)
 *  - window:  `calls` concurrent reserveWindow() on `key`
 */
import { closeDb } from "../../../src/server/db/client";
import { reserveAttempt, reserveWindow, THROTTLES } from "../../../src/server/services/rate-limit";

const [mode, raw] = process.argv.slice(2);
const args = JSON.parse(raw ?? "{}") as { key: string; calls: number; distinct?: boolean; startAt: number; max?: number; window?: number };

async function main() {
  // Common start time so every process fires at the same moment.
  await new Promise((r) => setTimeout(r, Math.max(0, args.startAt - Date.now())));
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
