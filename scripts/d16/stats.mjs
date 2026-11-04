// D16 pooled analysis: the statistics and the decision rules, as pre-registered in
// docs/reports/d16-timing/plan-2026-11.md (owner decision 4 Nov 2026: acceptance-criterion.md
// option 2, 600 probes per class per run, Rules A–E). Pure functions, no I/O: pooled.mjs reads the
// run folders and calls analyse(); tests/unit/d16-stats.test.ts checks every rule on synthetic data.
//
// Everything that decides the verdict is a constant here (PLAN). Changing any of it after a run
// has been made is a change of the pre-registered criterion and needs a new owner decision.

/** Class names as written by probe.mjs. */
export const CLASS = Object.freeze({ U: "unknown", K: "known", L0: "listed", L2: "listedAccount" });

export const PLAN = Object.freeze({
  runs: 3,
  probesPerClass: 600,
  classes: Object.freeze([CLASS.U, CLASS.K, CLASS.L0, CLASS.L2]),
  /** Rule A: P1's median 1-second CPU sample in the probe window, % of one core. */
  cpuMinMedian: 95,
  /** Rule B: pooled 90 % CI of the median shift inside ±5 %, for each of these comparisons. */
  equivalenceMargin: 5,
  equivalenceComparisons: Object.freeze([
    Object.freeze([CLASS.L2, CLASS.U]),
    Object.freeze([CLASS.K, CLASS.U]),
    Object.freeze([CLASS.L0, CLASS.U]),
    Object.freeze([CLASS.L2, CLASS.L0]),
  ]),
  /** Rules C, D, E apply to the primary comparison: an allowlisted account vs an unknown address. */
  primary: Object.freeze([CLASS.L2, CLASS.U]),
  /** Rule C: pooled one-sided 95 % upper bound of the primary shift below +2.5 %. */
  upperMargin: 2.5,
  /** Rule D: pooled 90 % CI of the primary p90 ratio inside ±5 %. */
  p90Margin: 5,
  /** Rule E: no single run's 95 % CI of the primary shift entirely outside ±5 %. */
  consistencyMargin: 5,
  bootstrap: 2000,
  seed: 20261104,
});

/** Linear-interpolation quantile (the same definition as analyze.mjs), p in [0, 100]. */
export function quantile(xs, p) {
  if (!xs.length) throw new Error("quantile of an empty sample");
  const s = Float64Array.from(xs).sort();
  const i = (p / 100) * (s.length - 1);
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}

/** Deterministic PRNG (mulberry32): the same seed gives the same bootstrap, so a verdict reproduces. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Number of pairs (a, b) with a − b ≤ v, for ascending a and b, in O(n + m). */
function countAtMost(a, b, v) {
  let count = 0;
  let j = 0;
  for (let i = 0; i < a.length; i++) {
    // b[j] ≥ a[i] − v  ⇔  a[i] − b[j] ≤ v; a is ascending, so the threshold only rises.
    while (j < b.length && b[j] < a[i] - v) j++;
    count += b.length - j;
  }
  return count;
}

/** The k-th smallest (1-based) of all pairwise differences a[i] − b[j], for ascending a and b. */
function kthDifference(a, b, k) {
  let lo = a[0] - b[b.length - 1];
  let hi = a[a.length - 1] - b[0];
  // 1e-10 in log units is about 1e-8 %: far below anything the rules can see.
  for (let it = 0; it < 200 && hi - lo > 1e-10; it++) {
    const mid = (lo + hi) / 2;
    if (countAtMost(a, b, mid) >= k) hi = mid;
    else lo = mid;
  }
  return hi;
}

/**
 * Hodges–Lehmann shift between two samples on the log scale: the median of all n·m pairwise
 * differences log(x_i) − log(y_j). Returned as a log ratio (multiply by 100 for an approximate %,
 * or use toPct for the exact percentage).
 */
export function hlLogShift(xs, ys) {
  const a = Float64Array.from(xs, Math.log).sort();
  const b = Float64Array.from(ys, Math.log).sort();
  return hlSorted(a, b);
}
function hlSorted(a, b) {
  const n = a.length * b.length;
  if (n % 2) return kthDifference(a, b, (n + 1) / 2);
  return (kthDifference(a, b, n / 2) + kthDifference(a, b, n / 2 + 1)) / 2;
}

/** log(p90(x) / p90(y)). */
export function logP90Ratio(xs, ys) {
  return Math.log(quantile(xs, 90)) - Math.log(quantile(ys, 90));
}

/** A log ratio as a percentage difference. */
export const toPct = (logRatio) => 100 * (Math.exp(logRatio) - 1);

/** Rounds of one run: one value per class per round (rounds with a missing class are dropped). */
function roundsOf(run, classes) {
  const byRound = new Map();
  for (const r of run.rows) {
    if (!byRound.has(r.round)) byRound.set(r.round, {});
    byRound.get(r.round)[r.cls] = r.ms;
  }
  return [...byRound.values()].filter((r) => classes.every((c) => r[c] !== undefined));
}

/** Per-run validity (Rule A) and plan conformance. */
export function checkRun(run) {
  const reasons = [];
  const counts = {};
  let non401 = 0;
  for (const r of run.rows) {
    counts[r.cls] = (counts[r.cls] ?? 0) + 1;
    if (r.status !== 401) non401 += 1;
  }
  if (non401) reasons.push(`A: ${non401} probe(s) not answered 401`);
  if (!(run.cpuMedian >= PLAN.cpuMinMedian)) reasons.push(`A: P1 not saturated (median CPU ${run.cpuMedian} % < ${PLAN.cpuMinMedian} %)`);
  const plan = [];
  for (const c of PLAN.classes) if (counts[c] !== PLAN.probesPerClass) plan.push(`class ${c}: ${counts[c] ?? 0} probes, plan ${PLAN.probesPerClass}`);
  for (const c of Object.keys(counts)) if (!PLAN.classes.includes(c)) plan.push(`unexpected class ${c}`);
  if (run.probesPerClass !== PLAN.probesPerClass) plan.push(`meta probesPerClass ${run.probesPerClass}, plan ${PLAN.probesPerClass}`);
  if (run.worktreeClean === false) plan.push("run made from a modified checkout");
  return { valid: reasons.length === 0, reasons, notPerPlan: plan, non401, counts };
}

/**
 * The pooled analysis and verdict for the three runs.
 * runs: [{ runId, commit, connections, probesPerClass, worktreeClean, cpuMedian, rows: [{ round, cls, status, ms }] }]
 * Returns every estimate, interval and rule, and verdict: PASS | FAIL | INCONCLUSIVE | INVALID | NOT_PER_PLAN.
 */
export function analyse(runs, plan = PLAN) {
  const checks = runs.map(checkRun);
  const notPerPlan = checks.flatMap((c, i) => c.notPerPlan.map((m) => `${runs[i].runId}: ${m}`));
  if (runs.length !== plan.runs) notPerPlan.push(`${runs.length} runs, plan ${plan.runs}`);
  if (new Set(runs.map((r) => r.runId)).size !== runs.length) notPerPlan.push("run ids are not distinct");
  if (new Set(runs.map((r) => r.commit)).size > 1) notPerPlan.push("runs were made on different commits");
  if (new Set(runs.map((r) => r.connections)).size > 1) notPerPlan.push("runs used different P2 connection counts (the setting must be frozen)");
  const invalid = checks.flatMap((c, i) => c.reasons.map((m) => `${runs[i].runId}: ${m}`));

  const rand = mulberry32(plan.seed);
  // Per class: the raw values (for p90) and their logs, sorted once (for the HL shifts).
  const prep = (cols) => ({ cols, logs: Object.fromEntries(plan.classes.map((c) => [c, Float64Array.from(cols[c], Math.log).sort()])) });
  const perRun = runs.map((run) => {
    const rounds = roundsOf(run, plan.classes);
    return { rounds, ...prep(Object.fromEntries(plan.classes.map((c) => [c, rounds.map((r) => r[c])]))) };
  });
  const comparisons = [...plan.equivalenceComparisons];
  const key = ([a, b]) => `${a} vs ${b}`;
  const result = { plan: { ...plan }, comparisons: {}, rules: {}, invalid, notPerPlan, perRunChecks: checks };
  const short = perRun.map((r, i) => (r.rounds.length < 2 ? `${runs[i].runId}: fewer than 2 rounds with every class` : null)).filter(Boolean);
  if (short.length) {
    // Nothing to estimate: the run set does not have the planned shape.
    result.notPerPlan.push(...short);
    result.verdict = "NOT_PER_PLAN";
    return result;
  }
  const stat = (p, [a, b]) => hlSorted(p.logs[a], p.logs[b]);
  const p90 = (p, [a, b]) => logP90Ratio(p.cols[a], p.cols[b]);

  // Point estimates: per run, then the pooled mean over runs (equal weights, equal n per run).
  const point = {};
  for (const cmp of comparisons) {
    const per = perRun.map((r) => stat(r, cmp));
    point[key(cmp)] = { perRun: per, pooled: per.reduce((s, x) => s + x, 0) / per.length };
  }
  const p90PerRun = perRun.map((r) => p90(r, plan.primary));
  const p90Pooled = p90PerRun.reduce((s, x) => s + x, 0) / p90PerRun.length;

  // Round-block bootstrap, stratified by run: resample each run's rounds with replacement,
  // recompute every per-run statistic, average over runs.
  const boot = Object.fromEntries(comparisons.map((c) => [key(c), { pooled: [], perRun: runs.map(() => []) }]));
  const bootP90 = [];
  for (let b = 0; b < plan.bootstrap; b++) {
    const resampled = perRun.map(({ rounds }) => {
      const pick = rounds.map(() => rounds[Math.floor(rand() * rounds.length)]);
      return prep(Object.fromEntries(plan.classes.map((c) => [c, pick.map((r) => r[c])])));
    });
    for (const cmp of comparisons) {
      const per = resampled.map((p) => stat(p, cmp));
      boot[key(cmp)].pooled.push(per.reduce((s, x) => s + x, 0) / per.length);
      per.forEach((x, i) => boot[key(cmp)].perRun[i].push(x));
    }
    const pp = resampled.map((p) => p90(p, plan.primary));
    bootP90.push(pp.reduce((s, x) => s + x, 0) / pp.length);
  }

  const pct = (x) => +toPct(x).toFixed(3);
  const ci = (xs, lo, hi) => [pct(quantile(xs, lo)), pct(quantile(xs, hi))];
  for (const cmp of comparisons) {
    const k = key(cmp);
    result.comparisons[k] = {
      pooledPct: pct(point[k].pooled),
      ci90Pct: ci(boot[k].pooled, 5, 95),
      upper95Pct: pct(quantile(boot[k].pooled, 95)),
      perRun: point[k].perRun.map((x, i) => ({ runId: runs[i].runId, pct: pct(x), ci95Pct: ci(boot[k].perRun[i], 2.5, 97.5) })),
    };
  }
  const prim = result.comparisons[key(plan.primary)];
  result.p90 = { comparison: key(plan.primary), pooledPct: pct(p90Pooled), ci90Pct: ci(bootP90, 5, 95), perRunPct: p90PerRun.map(pct) };

  // Rules B–E. Each is PASS (bound inside the margin), FAIL (estimate outside the margin, or the
  // interval entirely outside it) or INCONCLUSIVE (the interval straddles the margin).
  const twoSided = (est, [lo, hi], m) => (lo > -m && hi < m ? "PASS" : Math.abs(est) >= m || lo >= m || hi <= -m ? "FAIL" : "INCONCLUSIVE");
  result.rules.B = Object.fromEntries(comparisons.map((cmp) => {
    const c = result.comparisons[key(cmp)];
    return [key(cmp), twoSided(c.pooledPct, c.ci90Pct, plan.equivalenceMargin)];
  }));
  result.rules.C = prim.upper95Pct < plan.upperMargin ? "PASS" : prim.pooledPct >= plan.upperMargin || prim.ci90Pct[0] >= plan.upperMargin ? "FAIL" : "INCONCLUSIVE";
  result.rules.D = twoSided(result.p90.pooledPct, result.p90.ci90Pct, plan.p90Margin);
  result.rules.E = prim.perRun.some((r) => r.ci95Pct[0] >= plan.consistencyMargin || r.ci95Pct[1] <= -plan.consistencyMargin) ? "FAIL" : "PASS";

  const all = [...Object.values(result.rules.B), result.rules.C, result.rules.D, result.rules.E];
  result.verdict = notPerPlan.length ? "NOT_PER_PLAN" : invalid.length ? "INVALID" : all.includes("FAIL") ? "FAIL" : all.includes("INCONCLUSIVE") ? "INCONCLUSIVE" : "PASS";
  return result;
}
