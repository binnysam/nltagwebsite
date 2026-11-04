// Types for stats.mjs (used by tests/unit/d16-stats.test.ts; the harness itself runs the .mjs).
export declare const CLASS: { readonly U: "unknown"; readonly K: "known"; readonly L0: "listed"; readonly L2: "listedAccount" };

export interface Plan {
  runs: number;
  probesPerClass: number;
  classes: readonly string[];
  cpuMinMedian: number;
  equivalenceMargin: number;
  equivalenceComparisons: readonly (readonly [string, string])[];
  primary: readonly [string, string];
  upperMargin: number;
  p90Margin: number;
  consistencyMargin: number;
  bootstrap: number;
  seed: number;
}
export declare const PLAN: Readonly<Plan>;

export interface ProbeRow {
  round: number;
  cls: string;
  status: number;
  ms: number;
}
export interface Run {
  runId: string;
  commit: string;
  connections: number;
  probesPerClass: number;
  worktreeClean?: boolean;
  cpuMedian: number;
  rows: ProbeRow[];
}
export type RuleResult = "PASS" | "FAIL" | "INCONCLUSIVE";
export interface Comparison {
  pooledPct: number;
  ci90Pct: [number, number];
  upper95Pct: number;
  perRun: { runId: string; pct: number; ci95Pct: [number, number] }[];
}
export interface Result {
  plan: Plan;
  comparisons: Record<string, Comparison>;
  p90: { comparison: string; pooledPct: number; ci90Pct: [number, number]; perRunPct: number[] };
  rules: { B: Record<string, RuleResult>; C: RuleResult; D: RuleResult; E: "PASS" | "FAIL" };
  invalid: string[];
  notPerPlan: string[];
  perRunChecks: { valid: boolean; reasons: string[]; notPerPlan: string[]; non401: number; counts: Record<string, number> }[];
  verdict: "PASS" | "FAIL" | "INCONCLUSIVE" | "INVALID" | "NOT_PER_PLAN";
}

export declare function quantile(xs: ArrayLike<number>, p: number): number;
export declare function mulberry32(seed: number): () => number;
export declare function hlLogShift(xs: ArrayLike<number>, ys: ArrayLike<number>): number;
export declare function logP90Ratio(xs: ArrayLike<number>, ys: ArrayLike<number>): number;
export declare function toPct(logRatio: number): number;
export declare function checkRun(run: Run): Result["perRunChecks"][number];
export declare function analyse(runs: Run[], plan?: Plan): Result;
