// D16 finding 1: how precise is one run, and what would a confidence-based criterion need?
// Read-only analysis of committed probe CSVs (no server, no database). It does NOT decide any
// verdict: analyze.mjs still applies the owner's current criteria. Proposal and reasoning:
// docs/reports/d16-timing/acceptance-criterion.md.
//
// Usage: node scripts/d16/criterion-evidence.mjs <probes.csv> [<probes.csv> ...]
// Deterministic (seeded resampling), so the numbers in the proposal can be reproduced exactly.
import { readFileSync } from "node:fs";

const files = process.argv.slice(2);
if (!files.length) throw new Error("usage: node criterion-evidence.mjs <probes.csv> [...]");

let state = 20261104;
const rnd = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296;
const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
const q = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  const i = (p / 100) * (s.length - 1);
  const lo = Math.floor(i);
  return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo);
};
const sd = (xs) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
};
/** Hodges-Lehmann shift of log(ms), as a percentage: median of all pairwise log differences. */
const hlPct = (a, b) => {
  const la = a.map(Math.log);
  const lb = b.map(Math.log);
  const d = new Float64Array(la.length * lb.length);
  let i = 0;
  for (const x of la) for (const y of lb) d[i++] = x - y;
  d.sort();
  const m = d.length % 2 ? d[(d.length - 1) / 2] : (d[d.length / 2 - 1] + d[d.length / 2]) / 2;
  return 100 * (Math.exp(m) - 1);
};
const f = (x, n = 1) => (x >= 0 ? "+" : "") + x.toFixed(n);

const perRun = [];
for (const file of files) {
  const rows = readFileSync(file, "utf8").trim().split("\n").slice(1).map((l) => l.split(","));
  const rounds = new Map();
  for (const [, round, cls, , status, ms] of rows) {
    if (status !== "401") continue;
    if (!rounds.has(round)) rounds.set(round, {});
    rounds.get(round)[cls] = Number(ms);
  }
  const R = [...rounds.values()].filter((r) => r.known !== undefined && r.unknown !== undefined);
  const k = R.map((r) => r.known);
  const u = R.map((r) => r.unknown);
  const listed = R.filter((r) => r.listed !== undefined).map((r) => r.listed);

  const B = 2000;
  const medDiff = (a, b) => q(a, 50) - q(b, 50);
  const boot = [];
  const p90boot = [];
  for (let i = 0; i < B; i++) {
    const rk = k.map(() => pick(k));
    const ru = u.map(() => pick(u));
    boot.push(medDiff(rk, ru));
    p90boot.push(100 * (q(rk, 90) / q(ru, 90) - 1));
  }
  // Exchangeable labels = no true difference: how often would a run meet "median diff <= 1 ms"?
  const pool = [...k, ...u];
  let nullPass = 0;
  for (let i = 0; i < B; i++) {
    for (let j = pool.length - 1; j > 0; j--) {
      const s = Math.floor(rnd() * (j + 1));
      [pool[j], pool[s]] = [pool[s], pool[j]];
    }
    if (medDiff(pool.slice(0, k.length), pool.slice(k.length)) <= 1) nullPass += 1;
  }
  // Hodges-Lehmann on log(ms), resampling whole rounds.
  const hlBoot = [];
  for (let i = 0; i < 300; i++) {
    const rs = R.map(() => pick(R));
    hlBoot.push(hlPct(rs.map((r) => r.known), rs.map((r) => r.unknown)));
  }
  const mk = k.reduce((a, b) => a + b, 0) / k.length;
  const mu = u.reduce((a, b) => a + b, 0) / u.length;
  const corr = R.reduce((a, r) => a + (r.known - mk) * (r.unknown - mu), 0) / R.length / (sd(k) * sd(u));
  const run = {
    file,
    n: R.length,
    medK: q(k, 50),
    medU: q(u, 50),
    diff: medDiff(k, u),
    se: sd(boot),
    ci: [q(boot, 2.5), q(boot, 97.5)],
    nullPass: nullPass / B,
    hl: hlPct(k, u),
    hlSe: sd(hlBoot),
    p90: 100 * (q(k, 90) / q(u, 90) - 1),
    p90Se: sd(p90boot),
    corr,
    sdSample: sd([...k, ...u]),
  };
  if (listed.length) {
    const lb = [];
    for (let i = 0; i < B; i++) lb.push(medDiff(listed.map(() => pick(listed)), u.map(() => pick(u))));
    run.listed = { median: q(listed, 50), diff: medDiff(listed, u), ci: [q(lb, 2.5), q(lb, 97.5)] };
  }
  perRun.push(run);
}

console.log("run | n/class | median known / unknown (ms) | diff (ms) | bootstrap SE | 95% CI (ms) | P(meets '<= 1 ms' with no true difference) | HL log shift (SE) | p90 diff (SE) | within-round corr");
for (const r of perRun) {
  console.log(
    `${r.file} | ${r.n} | ${r.medK.toFixed(1)} / ${r.medU.toFixed(1)} | ${f(r.diff)} | ${r.se.toFixed(1)} | [${f(r.ci[0])}, ${f(r.ci[1])}] | ${r.nullPass.toFixed(2)} | ${f(r.hl, 2)} % (${r.hlSe.toFixed(2)}) | ${f(r.p90, 2)} % (${r.p90Se.toFixed(2)}) | ${f(r.corr, 2)}`,
  );
  if (r.listed) console.log(`    listed: median ${r.listed.median.toFixed(1)} ms; listed - unknown ${f(r.listed.diff)} ms, 95% CI [${f(r.listed.ci[0])}, ${f(r.listed.ci[1])}]`);
}

// Design table: pooled over 3 independent runs, HL log shift as the statistic.
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const n0 = mean(perRun.map((r) => r.n));
const seRun = mean(perRun.map((r) => r.hlSe));
const seP90Run = mean(perRun.map((r) => r.p90Se));
const RUNS = 3;
const zA = 1.6449;
const zB = 1.2816;
const phi = (x) => {
  // Abramowitz-Stegun 7.1.26 erf approximation (|error| < 1.5e-7).
  const t = 1 / (1 + 0.3275911 * Math.abs(x / Math.SQRT2));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-((x / Math.SQRT2) ** 2));
  return 0.5 * (1 + Math.sign(x) * y);
};
const pooled = (se, n) => (se * Math.sqrt(n0 / n)) / Math.sqrt(RUNS);
console.log(`\nper-run SE (n=${n0}/class): HL ${seRun.toFixed(2)} %, p90 ${seP90Run.toFixed(2)} %; pooled over ${RUNS} runs: HL ${pooled(seRun, n0).toFixed(2)} %, p90 ${pooled(seP90Run, n0).toFixed(2)} %`);
console.log("\nn/class/run | power, |median shift| < E (TOST, 5 %) | power, upper bound < +P for P = 5 / 2.5 / 2 % | power, |p90 diff| < 5 % / 10 %");
for (const n of [200, 500, 1000]) {
  const s = pooled(seRun, n);
  const sp = pooled(seP90Run, n);
  const tost = (m, se) => Math.max(0, 2 * phi(m / se - zA) - 1);
  const one = (m, se) => phi(m / se - zA);
  console.log(`${n} | ${tost(5, s).toFixed(2)} | ${one(5, s).toFixed(2)} / ${one(2.5, s).toFixed(2)} / ${one(2, s).toFixed(2)} | ${tost(5, sp).toFixed(2)} / ${tost(10, sp).toFixed(2)}`);
}
// Attacker: one address vs an unlimited supply of fresh unknown addresses -> one-sample SE.
console.log("\ndifference | samples an attacker needs on one address (95 % confidence, 90 % power) | days at ~100 counted checks per address per day");
for (const m of [12, 5, 2.5, 2, 1]) {
  const need = n0 * (((zA + zB) * seRun) / Math.SQRT2 / m) ** 2;
  console.log(`${m} % | ${Math.ceil(need)} | ${(need / 100).toFixed(1)}`);
}
