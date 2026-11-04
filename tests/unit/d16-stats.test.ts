// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyse, CLASS, hlLogShift, logP90Ratio, mulberry32, PLAN, quantile, toPct, type Plan, type Run } from "../../scripts/d16/stats.mjs";

/**
 * D16 pooled analysis (scripts/d16/stats.mjs): the pre-registered Rules A–E (owner decision
 * 4 Nov 2026, docs/reports/d16-timing/plan-2026-11.md), checked on seeded synthetic runs shaped like
 * the real ones (median ≈ 950 ms, ≈ 27 % spread, within-round correlation ≈ 0.2).
 */

const SLOW = 120_000;

function gaussian(rand: () => number) {
  const u = Math.max(rand(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

interface SynthOptions {
  runId: string;
  seed: number;
  /** % shift per class, e.g. { listedAccount: 10 } */
  shift?: Partial<Record<string, number>>;
  n?: number;
  classes?: string[];
  cpuMedian?: number;
  non401?: number;
  commit?: string;
  connections?: number;
  worktreeClean?: boolean;
}

function synthRun(o: SynthOptions): Run {
  const rand = mulberry32(o.seed);
  const n = o.n ?? 600;
  const classes = o.classes ?? [...PLAN.classes];
  const rows: Run["rows"] = [];
  let bad = o.non401 ?? 0;
  for (let round = 0; round < n; round++) {
    const roundEffect = 0.12 * gaussian(rand);
    for (const cls of classes) {
      const ms = Math.exp(Math.log(950) + roundEffect + 0.24 * gaussian(rand)) * (1 + (o.shift?.[cls] ?? 0) / 100);
      rows.push({ round, cls, status: bad-- > 0 ? 429 : 401, ms });
    }
  }
  return {
    runId: o.runId,
    commit: o.commit ?? "abc1234",
    connections: o.connections ?? 256,
    probesPerClass: n,
    worktreeClean: o.worktreeClean ?? true,
    cpuMedian: o.cpuMedian ?? 105,
    rows,
  };
}

/**
 * Seeds 31–33: a triple whose no-difference runs have every pooled estimate within ±0.12 %, so the
 * tests below exercise the rules rather than sampling luck. (The estimator is unbiased: over 60
 * seeds the per-run L2–U estimate averages −0.06 % with SD 1.25 %; some triples drift by 2 SD.)
 */
const three = (shift?: SynthOptions["shift"], extra: Partial<SynthOptions>[] = []) =>
  [1, 2, 3].map((i) => synthRun({ runId: `run-${i}`, seed: 30 + i, shift, ...extra[i - 1] }));

/** The planned rules with fewer bootstrap resamples, for the rule-mechanics tests (speed only). */
const quick: Plan = { ...PLAN, bootstrap: 400 };

describe("D16 statistics: building blocks", () => {
  it("quantile uses linear interpolation (same definition as analyze.mjs)", () => {
    expect(quantile([1, 2, 3, 4], 50)).toBe(2.5);
    expect(quantile([1, 2, 3, 4], 0)).toBe(1);
    expect(quantile([1, 2, 3, 4], 100)).toBe(4);
    expect(quantile([4, 1, 3, 2], 90)).toBeCloseTo(3.7, 12);
  });

  it("Hodges–Lehmann shift equals the brute-force median of all pairwise log differences", () => {
    const rand = mulberry32(7);
    for (const [n, m] of [[17, 23], [20, 30], [1, 1], [2, 3]] as const) {
      const xs = Array.from({ length: n }, () => 500 + 1000 * rand());
      const ys = Array.from({ length: m }, () => 500 + 1000 * rand());
      const diffs = xs.flatMap((x) => ys.map((y) => Math.log(x) - Math.log(y))).sort((a, b) => a - b);
      const k = diffs.length;
      const brute = k % 2 ? diffs[(k - 1) / 2]! : (diffs[k / 2 - 1]! + diffs[k / 2]!) / 2;
      expect(hlLogShift(xs, ys)).toBeCloseTo(brute, 9);
    }
  });

  it("a constant factor is recovered exactly: y × 1.03 vs y is +3 %", () => {
    const ys = Array.from({ length: 101 }, (_, i) => 700 + 7 * i);
    expect(toPct(hlLogShift(ys.map((y) => y * 1.03), ys))).toBeCloseTo(3, 9);
    expect(toPct(logP90Ratio(ys.map((y) => y * 0.95), ys))).toBeCloseTo(-5, 9);
  });

  it("the PRNG is deterministic per seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const c = mulberry32(43);
    const sa = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(sa);
    expect([c(), c(), c()]).not.toEqual(sa);
  });

  it("the pre-registered plan is pinned (changing it needs a new owner decision)", () => {
    expect(PLAN).toEqual({
      runs: 3,
      probesPerClass: 600,
      classes: ["unknown", "known", "listed", "listedAccount"],
      cpuMinMedian: 95,
      equivalenceMargin: 5,
      equivalenceComparisons: [["listedAccount", "unknown"], ["known", "unknown"], ["listed", "unknown"], ["listedAccount", "listed"]],
      primary: ["listedAccount", "unknown"],
      upperMargin: 2.5,
      p90Margin: 5,
      consistencyMargin: 5,
      bootstrap: 2000,
      seed: 20261104,
    } satisfies Plan);
    expect(Object.isFrozen(PLAN)).toBe(true);
  });
});

describe("D16 pooled verdict (Rules A–E)", () => {
  it("PASS: no difference between any classes, all rules pass, and the result is reproducible", () => {
    const runs = three();
    const r = analyse(runs);
    expect(r.verdict).toBe("PASS");
    expect(r.rules).toEqual({
      B: { "listedAccount vs unknown": "PASS", "known vs unknown": "PASS", "listed vs unknown": "PASS", "listedAccount vs listed": "PASS" },
      C: "PASS",
      D: "PASS",
      E: "PASS",
    });
    const prim = r.comparisons["listedAccount vs unknown"]!;
    expect(prim.ci90Pct[0]).toBeLessThan(prim.pooledPct);
    expect(prim.ci90Pct[1]).toBeGreaterThan(prim.pooledPct);
    // Precision at the planned size, as estimated from the committed runs (pooled SE ≈ 0.8 %).
    expect(prim.ci90Pct[1] - prim.ci90Pct[0]).toBeLessThan(4);
    // Reproducible: the same runs give the same estimates, intervals and verdict.
    expect(analyse(runs, quick)).toEqual(analyse(runs, quick));
  }, SLOW);

  it("FAIL: an allowlisted account 10 % slower than an unknown address (B and C fail)", () => {
    const r = analyse(three({ [CLASS.L2]: 10 }), quick);
    expect(r.rules.B["listedAccount vs unknown"]).toBe("FAIL");
    expect(r.rules.C).toBe("FAIL");
    expect(r.verdict).toBe("FAIL");
    expect(r.comparisons["listedAccount vs unknown"]!.pooledPct).toBeGreaterThan(8);
  }, SLOW);

  it("FAIL: allowlisted addresses 7 % faster (the finding 3 shape) fail equivalence", () => {
    const r = analyse(three({ [CLASS.L2]: -7, [CLASS.L0]: -7 }), quick);
    expect(r.rules.B["listedAccount vs unknown"]).toBe("FAIL");
    expect(r.rules.B["listed vs unknown"]).toBe("FAIL");
    expect(r.rules.B["known vs unknown"]).toBe("PASS");
    expect(r.verdict).toBe("FAIL");
  }, SLOW);

  it("FAIL (Rule D): the same median but a 12 % slower tail for allowlisted accounts", () => {
    // Only the slowest 15 % of L2 probes are slowed: the median stays, p90 moves.
    const runs = three().map((run) => {
      const l2 = run.rows.filter((r) => r.cls === CLASS.L2).map((r) => r.ms).sort((a, b) => a - b);
      const cut = l2[Math.floor(0.85 * l2.length)]!;
      return { ...run, rows: run.rows.map((r) => (r.cls === CLASS.L2 && r.ms >= cut ? { ...r, ms: r.ms * 1.12 } : r)) };
    });
    const r = analyse(runs, quick);
    expect(r.rules.D).toBe("FAIL");
    expect(r.rules.B["listedAccount vs unknown"]).toBe("PASS");
    expect(r.verdict).toBe("FAIL");
  }, SLOW);

  it("INCONCLUSIVE: a small positive shift whose interval straddles the +2.5 % bound", () => {
    const r = analyse(three({ [CLASS.L2]: 1.8 }), quick);
    const prim = r.comparisons["listedAccount vs unknown"]!;
    expect(prim.pooledPct).toBeLessThan(2.5);
    expect(prim.upper95Pct).toBeGreaterThanOrEqual(2.5);
    expect(r.rules.C).toBe("INCONCLUSIVE");
    expect(r.verdict).toBe("INCONCLUSIVE");
  }, SLOW);

  it("FAIL (Rule E): one run 12 % slower is caught even when the pooled estimate looks small", () => {
    const runs = [
      synthRun({ runId: "run-1", seed: 2001, shift: { [CLASS.L2]: 12 } }),
      synthRun({ runId: "run-2", seed: 2002, shift: { [CLASS.L2]: -4 } }),
      synthRun({ runId: "run-3", seed: 2003, shift: { [CLASS.L2]: -4 } }),
    ];
    const r = analyse(runs, quick);
    expect(Math.abs(r.comparisons["listedAccount vs unknown"]!.pooledPct)).toBeLessThan(5);
    expect(r.rules.E).toBe("FAIL");
    expect(r.verdict).toBe("FAIL");
  }, SLOW);

  it("INVALID (Rule A): a non-401 probe, or P1 not saturated", () => {
    const non401 = analyse(three(undefined, [{}, { non401: 1 }, {}]), quick);
    expect(non401.verdict).toBe("INVALID");
    expect(non401.invalid).toEqual(["run-2: A: 1 probe(s) not answered 401"]);
    const cool = analyse(three(undefined, [{ cpuMedian: 94.9 }, {}, {}]), quick);
    expect(cool.verdict).toBe("INVALID");
    expect(cool.invalid[0]).toMatch(/^run-1: A: P1 not saturated/);
  }, SLOW);

  it("NOT_PER_PLAN: wrong sample size, run count, class set, commit, connections or a modified checkout", () => {
    const cases: [string, Run[], RegExp][] = [
      ["500 probes per class", three(undefined, [{ n: 500 }, {}, {}]), /class unknown: 500 probes, plan 600/],
      ["two runs", three().slice(0, 2), /2 runs, plan 3/],
      ["missing class", three(undefined, [{ classes: [CLASS.U, CLASS.K, CLASS.L0] }, {}, {}]), /class listedAccount: 0 probes/],
      ["different commits", three(undefined, [{}, { commit: "def5678" }, {}]), /different commits/],
      ["different connections", three(undefined, [{}, {}, { connections: 512 }]), /different P2 connection counts/],
      ["modified checkout", three(undefined, [{ worktreeClean: false }, {}, {}]), /modified checkout/],
      ["same run twice", [synthRun({ runId: "run-1", seed: 1 }), synthRun({ runId: "run-1", seed: 2 }), synthRun({ runId: "run-3", seed: 3 })], /not distinct/],
    ];
    for (const [label, runs, reason] of cases) {
      const r = analyse(runs, { ...PLAN, bootstrap: 50 });
      expect(r.verdict, label).toBe("NOT_PER_PLAN");
      expect(r.notPerPlan.join("; "), label).toMatch(reason);
    }
  }, SLOW);
});

describe("D16 pooled CLI (scripts/d16/pooled.mjs)", () => {
  it("reads three run folders, writes pooled-summary.json and exits 0 on PASS", () => {
    const root = mkdtempSync(join(tmpdir(), "d16-pooled-"));
    const dirs = three().map((run) => {
      const dir = join(root, run.runId);
      mkdirSync(dir);
      const csv = ["seq,round,class,position,status,ms", ...run.rows.map((r, i) => `${i},${r.round},${r.cls},0,${r.status},${r.ms.toFixed(3)}`)];
      writeFileSync(join(dir, "probes.csv"), csv.join("\n") + "\n");
      writeFileSync(join(dir, "cpu.csv"), "t_ms,cpu_percent,pids\n" + Array.from({ length: 60 }, (_, i) => `${1000 * (i + 1)},${100 + (i % 10)},4`).join("\n") + "\n");
      writeFileSync(join(dir, "meta.json"), JSON.stringify({ runId: run.runId, commit: run.commit, connections: 256, probesPerClass: 600, worktreeClean: true, probeStartOffsetMs: 0, probeEndOffsetMs: 61_000 }));
      return dir;
    });
    const r = spawnSync("node", ["scripts/d16/pooled.mjs", ...dirs], { encoding: "utf8" });
    expect(r.stdout).toMatch(/D16 pooled verdict: PASS/);
    expect(r.status).toBe(0);
    const summary = JSON.parse(readFileSync(join(root, "pooled-summary.json"), "utf8"));
    expect(summary.verdict).toBe("PASS");
    // All three folders are read (an argument-parsing slip once dropped the first one).
    expect(summary.runs.map((x: { runId: string }) => x.runId)).toEqual(["run-1", "run-2", "run-3"]);
    expect(summary.runs.map((x: { cpuMedian: number }) => x.cpuMedian)).toEqual([104.5, 104.5, 104.5]);
  }, SLOW);
});
