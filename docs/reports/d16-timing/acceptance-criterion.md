# D16 acceptance criterion: proposal (finding 1)

**Status: proposal for an owner decision. Nothing here changes the current rule.** The rule agreed on 4 Nov 2026 (decision O5) is still the one `scripts/d16/analyze.mjs` applies. No new D16 runs have been made; the owner asked for the criterion to be settled first.

All numbers below come from the four committed runs. They were made on `b4e37a8` and are now superseded (see `README.md`). Reproduce them with:

```bash
node scripts/d16/criterion-evidence.mjs docs/reports/d16-timing/run-{1,2,3}/probes.csv docs/reports/d16-timing/run-4-supplementary/probes.csv
```

The script is deterministic and reads only the CSVs. It leaves out probes that were not `401`: run-3 has one, so that run has 199 rounds.

## 1. The current rule and why it cannot work

For each run, comparing known with unknown addresses:
- |median difference| < 5 % and |p90 difference| < 5 %;
- "not positive": median(known) − median(unknown) ≤ 1 ms.

D16 is met only when three runs out of three pass.

| Run | Median known / unknown (ms) | Difference (ms) | Bootstrap SE (ms) | 95 % CI (ms) | Chance of meeting "≤ 1 ms" with **no** true difference |
|---|---|---|---|---|---|
| run-1 | 932.8 / 957.4 | −24.6 | 25.6 | [−65.2, +36.2] | 0.50 |
| run-2 | 981.5 / 989.0 | −7.6 | 29.8 | [−61.6, +57.6] | 0.55 |
| run-3 | 958.9 / 980.8 | −21.9 | 32.6 | [−83.0, +43.6] | 0.51 |
| run-4-supplementary | 938.3 / 929.3 | +9.1 | 26.7 | [−41.9, +64.1] | 0.50 |

The last column is a label-permutation null: known and unknown samples shuffled within the run, 2,000 times.

- **"≤ 1 ms" measures luck.** Its tolerance is about 30 times smaller than the standard error of the statistic it tests.
  - With no true difference, a run meets it about half the time.
  - So a perfect implementation passes 3 of 3 only about 12.5 % of the time: it is rejected about 7 times in 8.
  - A leaking implementation can still pass by chance.
- **The 5 % rules give no confidence.** They are point estimates, so they pass easily but say nothing about the size of difference that is ruled out.
  - Run-1 "PASSED", yet its 95 % interval also fits a known-address penalty of +36 ms (+3.8 %).
- **Pairing probes by round helps little.** The within-round correlation between known and unknown is only +0.16 to +0.21.
  - Other robust statistics are no more precise than the median difference. The Hodges–Lehmann shift of log(ms) has a per-run SE of 2.2–2.6 %.
  - The p90 difference is about twice as noisy (SE 2.5–4.7 % per run).

## 2. What a defensible criterion needs

1. **An interval, not a point estimate.** Pass only when the data rule out a difference larger than a stated margin, with stated confidence.
2. **Margins chosen from the risk, fixed before the runs.** The relevant risk is how many sign-in attempts an attacker would need on one address to see the difference.
3. **Power.** There must be enough probes that a correct implementation passes with high probability (≥ 90 %), so a FAIL means something.
4. **Pre-registration.** Before the first run, commit the criterion, the number of probes, the number of runs, the classes and the analysis code. Report every run. A run is invalid only for reasons declared in advance (a non-`401` probe, P1 not saturated); invalid runs are reported and replaced, never dropped. Also decide in advance what a FAIL leads to.

## 3. Proposed criterion

- **Statistic:** the Hodges–Lehmann shift between known and unknown on log(ms), as a percentage.
  - It is robust to the long right tail and is relative, so it does not depend on host speed.
  - It is as precise as the alternatives tested.
  - The p90 ratio is a secondary check.
- **Interval:** round-block bootstrap pooled over the three runs, with run as a stratum (rounds are resampled within each run). Each run is also reported on its own.
- **Pass when all of the following hold:**
  - **A. Validity** (unchanged): every timed probe answered `401`, and P1 was saturated (median 1-s CPU ≥ 95 % of one core).
  - **B. Equivalence:** the pooled 90 % CI of the shift lies inside ±E. This is two one-sided tests at α = 0.05.
  - **C. Not slower for addresses with an account** (the intent of "not positive"): the pooled one-sided 95 % upper bound of the shift is below +P.
  - **D. Tail:** the pooled 90 % CI of the p90 ratio lies inside ±T.
  - **E. Consistency:** no single run's 95 % CI lies entirely outside ±E. This catches a leak confined to one run, which pooling could hide.
- **Classes:** keep known and unknown, and **add an allowlisted account**, the shape of every production account (finding 3, `finding-3-allowlist-timing.md`).
  - The primary comparison is allowlisted account vs unknown.
  - Known (not allowlisted) vs unknown stays for continuity.

### Options and trade-offs

| | Option 1: same effort as now | **Option 2: recommended** | Option 3: strict |
|---|---|---|---|
| E (equivalence, median shift) | ±5 % | ±5 % | ±2 % |
| P ("not slower", upper bound) | +5 % | **+2.5 %** | +2 % |
| T (p90 ratio) | ±10 % | ±5 % | ±5 % |
| Probes per class per run | 200 | **550** | 1,050 |
| Probe time per run, 3–4 classes at ~1 s per probe | 10–13 min | **28–37 min** | 53–70 min |
| Chance a correct implementation passes B / C / D | 0.95 / 0.97 / 0.99 | 1.00 / ≥ 0.90 / ≥ 0.95 | ≥ 0.90 / ≥ 0.94 / 1.00 |
| Smallest difference ruled out (C) | 5 % | 2.5 % | 2 % |
| Attacker effort to detect a difference just inside P (one address, 95 % confidence, 90 % power) | ~199 attempts ≈ 2 days of continuous saturation | ~795 attempts ≈ 8 days | ~1,242 attempts ≈ 12 days |

The powers come from `criterion-evidence.mjs`, interpolated between 500 and 1,000 probes. The sample sizes are rounded up for 90 % power.

The attacker-effort row assumes the sandbox's noise, one address compared with an unlimited supply of fresh unknown addresses, and about 100 counted checks per address per day under the per-address schedule. Internet jitter would add noise, so a real attack needs more.

- **Why option 2:**
  - It keeps the agreed ±5 % equivalence, now as a confidence statement.
  - It replaces "≤ 1 ms" with a bound a correct implementation passes 9 times in 10.
  - The residual difference it allows (< 2.5 %) would cost an attacker about a week of continuous saturation per address. That is a sustained denial of service, visible to the CDN and the owner.
  - Each run takes about half an hour of probing.
- **Smaller margins cost much more.** The probes needed grow with 1/margin². Halving P from 2.5 % to about 1.25 % would need about 2,100 probes per class per run, roughly 2 hours of probing per run.
- **Pooling vs per-run:** pooling three runs is √3 times more precise than one run, but could hide one bad run, hence rule E.
- **Relative vs absolute margins:** percentages carry over between the sandbox and other hardware; milliseconds do not. Absolute latencies from the sandbox do not apply to Hostinger in any case.
- **Medians and tails:** the median shift is the most stable signal; p90 needs a wider margin or more probes.
- **What D16 cannot show:** it bounds the difference under one saturating load shape in one sandbox. It is evidence, not proof, of behaviour on Hostinger.

## 4. Before the next runs (all need owner approval)

1. Choose an option (or other margins) and record the decision.
2. Implement the pooled analysis next to `analyze.mjs`, keeping the current verdict printed alongside for comparison. Add the allowlisted-account class to `probe.mjs`, and commit both before any run.
3. Harness hygiene found in the PR #16 review:
   - `next start` also loads `.env.local` / `.env.production` / `.env` from the checkout for any variable `run.sh` does not set. Refuse to run when such files exist.
   - `.p1.log` is git-ignored only under the default output folder.
4. Decide whether the finding 3 mitigation lands first. If it does not, the allowlisted-account class is expected to fail (`finding-3-allowlist-timing.md`).
