# Intermittent raw timing-test failure: investigation (5 Nov 2026)

**Test:** `tests/integration/r4-timing.test.ts` › "raw (no floor)". It asserts that p99 of 100 known-address probes is below 400 ms, and with n = 100 that is the maximum.

**Nothing was changed:** no assertion, threshold or test. PR #22 is untouched. This report is evidence and analysis only.

## The failures

| CI run | Code | Known p99 | Shape | Diagnostics printed |
|---|---|---|---|---|
| 41820997338 | `7bcedde` | 460.1 ms | both classes, median 260 ms | none |
| 41889690214 | `2b1c7a0` | 774.5 ms | spikes, mostly single probes | series, event loop |
| 41933839419 | `1d3ffb6` code (PR #23, which changes only Markdown, CSV and JSON) | 455.6 ms | spikes, mostly single probes | series, event loop |

**Why `7bcedde` is not comparable:** it ran **before PR #19**. The raw test then kept the timing estimator between probes and let the K window fill, so 84 of 100 "known" samples were password checks and the rest were `429`s. Its medians of about 260 ms for both classes came from estimator carry-over. That was the reason PR #19 was made. The two later failures ran the PR #19 test.

**Saved series:** `series-2b1c7a0.json` and `series-pr23.json` hold the per-probe series and event-loop delay printed by each failure, extracted from the CI logs.

## What the series show
Probes slower than 150 ms:

| Failure | Known | Unknown | Slow pairs where both probes were > 130 ms | Event-loop delay max |
|---|---|---|---|---|
| `2b1c7a0` | **23** (6 over 300 ms) | 10 (1 over 300 ms) | 5 of 18 | 19.6 ms |
| PR #23 | **11** (3 over 300 ms) | 2 (0 over 300 ms) | 1 of 7 | 24.5 ms |

- **Mostly single-probe spikes.** In 13 of 18 and 6 of 7 slow pairs, only one probe was slow: the other probe in the same pair, a fraction of a second earlier or later, was normal.
  - The description of PR #22 reads the `2b1c7a0` failure as "both classes slowed together". That came from the class p90s (243 and 161 ms). Probe by probe, the slowdowns are short and hit one request at a time.
- **Not the event loop.** Its delay stayed below 25 ms.
- **Known probes spike more often:** about 2.3× in `2b1c7a0` and 5.5× in PR #23.

## Why known probes would spike more often (measured)
`statement-census.txt` records every database statement on the raw-test path for 30 known and 30 unknown probes, on local MariaDB 11.8.9. It uses the same clears and the same per-probe estimator reset as `sampleRaw()`, with the floor at 0.

| Per probe | Known | Unknown |
|---|---|---|
| Statements | 10.7 | 6.6 |
| **Writes** (`INSERT`/`UPDATE`) | **6.6** | **2.6** |
| Password hash (scrypt) | 1 (Better Auth verify) | 1 (calibration dummy hash, which runs on every probe once the estimator is reset) |

- **Where the extra statements come from:** a known probe also runs Better Auth's `user`, `account` and `verification` reads and the K-window reservations, three `INSERT IGNORE` + `UPDATE` pairs.
- **The audit insert:** `call()` waits for the gate's audit insert inside the timed window, for both classes alike (19 of 30 probes each, because of the 5-per-second cap).
- **Effect on known probes:** for a known probe, the password work the hold multiplies by 1.1 includes Better Auth's database reads, so a stall there is also amplified.

**Model comparison** (exact binomial test on which class each slow probe belonged to):

| Model | Expected share of unknown spikes | `2b1c7a0` (> 150 ms) | PR #23 (> 150 ms) | Both pooled (34 known, 12 unknown) |
|---|---|---|---|---|
| Runner-wide slowdown (CPU): every probe equally exposed | 0.50 | P = 0.018 | P = 0.011 | **P = 0.0008: rejected** |
| Stalls per statement | 0.38 | p = 0.38 | p = 0.15 | p = 0.097 |
| Stalls per **write** | 0.28 | p = 0.85 | p = 0.37 | **p = 0.87: consistent** |

## Conclusion
- **"Machine slowdown" is not supported** by the data.
  - A slowdown hitting every probe alike would make unknown probes about as likely to spike as known ones.
  - The split observed across both failures would then happen less than 1 time in 1,000.
- **The data fit short stalls of individual database statements.** Write or commit latency in the CI runner's MariaDB service container fits best, and those stalls hit the path that writes about 2.5× more.
- **This is an inference, not proof:** it rests on two failures, a threshold chosen after looking (150 ms), and the assumption that spikes are independent.
- **Nothing in MariaDB's own log points to a stall.** The service-container log printed at the end of the PR #23 job has no stall warnings, only the `io_uring` fallback notice; MariaDB does not log short commit stalls by default.

## What it means
- **CI reliability.** The raw test asserts the maximum of 100 probes taken with the floor off. A database stall of about 300 ms or more during any one of the 100 known probes fails it. That explains why it passes on most runs and locally (11 of 11 local runs on 5 Nov) and fails now and then on the shared runner.
- **Not a production timing oracle on its own.** Production keeps the 400 ms floor and the adaptive hold, and the saturated D16 runs passed every rule, Rule D on the p90 included.
- **A residual worth knowing.** Under intermittent database stalls, a failed sign-in for an address with an account is exposed to them about 2.5× as often, through its extra writes. Single slow answers are therefore somewhat more likely for known addresses during such periods.
  - This is a weak, noisy statistical signal, not a clean difference.
  - The floored tests' worst-case maxima point the same way: on the PR #23 run, known 476.7 ms against unknown 471.1 ms.

  Recorded for the owner; no change proposed without a decision.

## Recommendations (owner decisions; nothing implemented)
1. **Merge PR #22 as it is.** Its scrypt and `SELECT 1` control will separate CPU stalls from read-latency stalls on the next failure.
2. **Step 2 of the investigation, separate from PR #22:** add a **write** round trip to the control, for example an `INSERT` and a `DELETE` of one scratch row, so a commit stall is visible too. Optionally print per-statement durations on failure. Both are observation only, with no assertion change.
3. **Leave the assertion unchanged** until a failure with the control shows which kind of stall it was.

## PR #23 CI status (kept visible)
- **PR #23's CI run 41933839419 is red** (`verify`). Its one failure is this test: `expected 455.6 to be less than 400`, 1 failed and 250 passed.
- PR #23 changes only Markdown, CSV and JSON under `docs/reports/`; it changes no code or tests. The failure belongs to the test above, not to the PR's content.
- Later pushes to PR #23 run CI again, and those results are in the PR's checks, whatever they show.
