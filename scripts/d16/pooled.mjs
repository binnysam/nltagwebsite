// D16 pooled verdict over the three pre-registered runs (docs/reports/d16-timing/plan-2026-11.md).
// Reads each run folder (probes.csv, meta.json, cpu.csv; summary.json if present), applies the
// fixed Rules A–E from stats.mjs and writes pooled-summary.json. The per-run verdicts of the former
// criterion (analyze.mjs) are copied alongside for information only; they do not decide anything.
//
// Usage: node scripts/d16/pooled.mjs <run-dir> <run-dir> <run-dir> [--out <file>]
// Exit code: 0 PASS · 1 FAIL · 2 INCONCLUSIVE · 3 INVALID · 4 NOT_PER_PLAN
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { analyse, quantile } from "./stats.mjs";

const args = process.argv.slice(2);
const outAt = args.indexOf("--out");
const out = outAt >= 0 ? args[outAt + 1] : null;
const dirs = outAt >= 0 ? args.filter((_, i) => i !== outAt && i !== outAt + 1) : args;
if (!dirs.length) throw new Error("usage: node scripts/d16/pooled.mjs <run-dir> <run-dir> <run-dir> [--out <file>]");

function loadRun(dir) {
  const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));
  const rows = readFileSync(join(dir, "probes.csv"), "utf8")
    .trim()
    .split("\n")
    .slice(1)
    .map((l) => l.split(","))
    .map(([, round, cls, , status, ms]) => ({ round: Number(round), cls, status: Number(status), ms: Number(ms) }));
  // P1 CPU in the probe window, exactly as analyze.mjs computes it.
  const samples = readFileSync(join(dir, "cpu.csv"), "utf8").trim().split("\n").slice(1).map((l) => l.split(",").map(Number));
  const inWindow = samples.filter(([t]) => t >= meta.probeStartOffsetMs && t <= meta.probeEndOffsetMs).map(([, c]) => c);
  const cpuMedian = inWindow.length ? +quantile(inWindow, 50).toFixed(1) : 0;
  const summary = existsSync(join(dir, "summary.json")) ? JSON.parse(readFileSync(join(dir, "summary.json"), "utf8")) : null;
  return {
    run: { runId: meta.runId, commit: meta.commit, connections: meta.connections, probesPerClass: meta.probesPerClass, worktreeClean: meta.worktreeClean, cpuMedian, rows },
    formerVerdict: summary?.verdict ?? null,
  };
}

const loaded = dirs.map(loadRun);
const result = analyse(loaded.map((l) => l.run));
result.runs = loaded.map((l, i) => ({ dir: dirs[i], runId: l.run.runId, commit: l.run.commit, connections: l.run.connections, cpuMedian: l.run.cpuMedian, formerCriterionVerdict: l.formerVerdict }));
const file = out ?? join(dirname(dirs[0]), "pooled-summary.json");
writeFileSync(file, JSON.stringify(result, null, 2) + "\n");

console.log(`D16 pooled verdict: ${result.verdict}`);
for (const [k, c] of Object.entries(result.comparisons)) {
  console.log(`  ${k}: ${c.pooledPct} % (90 % CI ${c.ci90Pct.join(" … ")} %; one-sided 95 % upper ${c.upper95Pct} %) B=${result.rules.B[k]}`);
}
console.log(`  p90 ${result.p90.comparison}: ${result.p90.pooledPct} % (90 % CI ${result.p90.ci90Pct.join(" … ")} %) D=${result.rules.D}`);
console.log(`  C=${result.rules.C} E=${result.rules.E}`);
for (const m of [...result.notPerPlan, ...result.invalid]) console.log(`  ! ${m}`);
console.log(`  written: ${file}`);
process.exit({ PASS: 0, FAIL: 1, INCONCLUSIVE: 2, INVALID: 3, NOT_PER_PLAN: 4 }[result.verdict]);
