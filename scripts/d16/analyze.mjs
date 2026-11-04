// D16 harness: per-run analysis of the probe CSV and the P1 CPU samples.
// Usage: node analyze.mjs <run-dir>   (reads probes.csv, cpu.csv, load.json, meta.json; writes summary.json)
// Criteria (owner decision O5, 4 Nov 2026), for the known vs unknown classes:
//   - every timed probe answered 401 (else the run is INVALID, not a pass or a fail);
//   - |median diff| < 5 % and |p90 diff| < 5 % of the unknown class's value;
//   - "not positive": median(known) − median(unknown) ≤ 1 ms;
//   - P1 saturated: median 1-second CPU sample ≥ 95 % of one core during the probe window.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
const csv = readFileSync(join(dir, "probes.csv"), "utf8").trim().split("\n").slice(1).map((l) => l.split(","));
const byClass = {};
let non401 = 0;
for (const [, , cls, , status, ms] of csv) {
  (byClass[cls] ??= []).push(Number(ms));
  if (status !== "401") non401 += 1;
}
const pct = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  const i = (p / 100) * (s.length - 1);
  const lo = Math.floor(i);
  return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo);
};
const stats = Object.fromEntries(Object.entries(byClass).map(([k, xs]) => [k, { n: xs.length, median: +pct(xs, 50).toFixed(3), p90: +pct(xs, 90).toFixed(3), p10: +pct(xs, 10).toFixed(3), max: +Math.max(...xs).toFixed(3) }]));
const k = stats.known;
const u = stats.unknown;
const medianDiffMs = +(k.median - u.median).toFixed(3);
const p90DiffMs = +(k.p90 - u.p90).toFixed(3);
const medianDiffPct = +((medianDiffMs / u.median) * 100).toFixed(3);
const p90DiffPct = +((p90DiffMs / u.p90) * 100).toFixed(3);

let cpu = null;
if (existsSync(join(dir, "cpu.csv"))) {
  const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));
  const samples = readFileSync(join(dir, "cpu.csv"), "utf8").trim().split("\n").slice(1).map((l) => l.split(",").map(Number));
  // Only the probe window (the load ramps first).
  const inWindow = samples.filter(([t]) => t >= meta.probeStartOffsetMs && t <= meta.probeEndOffsetMs).map(([, c]) => c);
  cpu = { samples: inWindow.length, median: +pct(inWindow, 50).toFixed(1), p10: +pct(inWindow, 10).toFixed(1), min: +Math.min(...inWindow).toFixed(1), max: +Math.max(...inWindow).toFixed(1), atOrAbove95: inWindow.filter((c) => c >= 95).length };
}
const load = existsSync(join(dir, "load.json")) ? JSON.parse(readFileSync(join(dir, "load.json"), "utf8")) : null;

const checks = {
  allProbes401: non401 === 0,
  medianUnder5pct: Math.abs(medianDiffPct) < 5,
  p90Under5pct: Math.abs(p90DiffPct) < 5,
  notPositiveWithin1ms: medianDiffMs <= 1,
  p1Saturated: cpu ? cpu.median >= 95 : false,
};
const verdict = !checks.allProbes401 ? "INVALID (non-401 probes)" : !checks.p1Saturated ? "INVALID (P1 not saturated)" : checks.medianUnder5pct && checks.p90Under5pct && checks.notPositiveWithin1ms ? "PASS" : "FAIL";
const summary = { stats, medianDiffMs, medianDiffPct, p90DiffMs, p90DiffPct, non401, cpu, load: load && { requests: load.requests, ratePerSecond: load.ratePerSecond, statuses: load.statuses, errors: load.errors }, checks, verdict };
writeFileSync(join(dir, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));
