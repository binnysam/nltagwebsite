# D16 timing evidence

Harness and procedure: `scripts/d16/README.md`. The question D16 asks: under a saturating load, does a wrong password for an address **with** an account take measurably longer or shorter than for an address **without** one?

## Status (4 Nov 2026, after merging `main` at `0d77c75` into PR #16)

> **The four runs below are historical and superseded.**
> - They tested application code at **`b4e37a8`** (R4 v6.1 as merged in PR #12).
> - Since then `main` has changed the code they exercised: PR #13 (verification cleanup), #17 (purge race) and #18 (primary-key purge).
> - They do not describe current `main`, so they cannot close M3 (D16 "on merged code").
> - They are kept exactly as produced, for the record and as the basis for the analyses below.

| Finding (from the runs) | Status now |
|---|---|
| 1. The "≤ 1 ms, not positive" rule is decided by noise | **Open; owner decision.** Statistical analysis and a proposed criterion: `acceptance-criterion.md`. |
| 2. Run-3 INVALID: a fresh address got `429` (purge/reservation race); also the flood's 4–17 `429`s per run | **Fixed by PR #17** (`ddecb2c`): retry when the purge deletes the row between `INSERT` and `UPDATE`. The purge/reserve deadlock found while testing it is **fixed by PR #18** (`0d77c75`, primary-key purge). New runs should show no spurious `429` (to be confirmed). |
| 3. Allowlisted address without an account answers ~10–14 % faster than an account under saturation | **Fixed, merged to `main` in PR #20 (`21c4b3a`, 4 Nov 2026)** (owner-approved Option A), with a deterministic statement-order regression test and before/after harness results: `finding-3-allowlist-timing.md`. It revealed allowlist membership (every production staff address), **not** activation status. Confirmation under saturation is part of the final runs (`plan-2026-11.md`). |
| 4. Saturation level (CPU) | Informational, unchanged. |
| 5. Single-process test asserts `401` and clears K windows | **Superseded:** `tests/integration/r4-timing.test.ts` was revised after the merge. The raw test uses `sampleRaw()` (PR #19); the floored and flood tests use `sample()`, which clears the K windows before every pair and requires `401` on every probe (PR #16). |

- **No new D16 runs have been made yet.** The owner adopted the criterion on 4 Nov 2026 (option 2, 600 probes per class per run, Rules A–E): `acceptance-criterion.md`.
- **The final runs follow the pre-registered plan in `plan-2026-11.md`.** It covers four classes (with an allowlisted account), the smoke test and frozen connection rule, three runs and the pooled verdict from `scripts/d16/pooled.mjs`.
- **When:** after the tooling PR is merged, on a commit that contains the finding 3 fix (`21c4b3a` or later). Results go in `2026-11-main-<sha>/`, all of them published.

## Historical runs (`b4e37a8`, superseded)

Everything below is the record made for readiness PR C on 4 Nov 2026. The results and findings are unchanged; only status notes have been added.

**Criteria then** (owner decision O5, 4 Nov 2026), known vs unknown, per run:
- every timed probe `401`;
- P1 saturated (median 1-s CPU ≥ 95 % of one core);
- |median diff| < 5 % and |p90 diff| < 5 %;
- median(known) − median(unknown) ≤ 1 ms.

D16 needs **three independent valid runs that all pass.**

**Recorded result: D16 was NOT met by these runs.**
- Of the three planned independent runs, two passed and one was **invalid** (one probe answered `429`).
- A fourth, supplementary run, made afterwards with the identical harness, **failed** the "not positive" criterion (+9.05 ms).
- No run was discarded, re-labelled or re-analysed.

### Environment (same for every run)
- **Application code:** `main` at `b4e37a8` (R4 v6.1 as deployed), production build (`next build`, `next start`, `NODE_ENV=production`). The harness ran from the uncommitted PR C working tree on top of `b4e37a8`; `meta.json` → `commit` records that base.
- **Machine:** cloud sandbox VM, Intel Xeon @ 2.10 GHz × 4 cores, Node v22.23.4. MariaDB `11.8.9-MariaDB-ubu2404` in Docker (container not pinned), scratch database `nltag_d16`.
- **Processes:** P1 on cores 0–1, P2 (256 connections) on cores 2–3, P3 on core 3. `D16_STRESS=0`.
- **Probes:** N = 200 per class (known, unknown, listed), ramp 10 s. A fresh P1 process and fresh rate-limit tables for every run, with 3 minutes between runs 1 → 2 → 3.
- **Classes:** "known" = an account **not** on the allowlist. "listed" = on the allowlist, **no** account (see finding 3).
- **Mail:** the local SMTP sink had 0 connections in every run (no mail traffic).
- **`meta.json` field name:** `startedAt` is in fact written when the run **ends**. This was a naming slip in `run.sh`, now corrected to `recordedAt` for future runs; the committed `meta.json` files are left exactly as produced.

### Results

| Run | Recorded (UTC, end) | Verdict | Probes `401` | Median known / unknown (ms) | Median diff | p90 known / unknown (ms) | p90 diff | Median listed (ms) | P1 CPU, % of one core (median; p10; seconds ≥ 95 %) | P2 load | `timing_floor_exceeded` lines | SMTP |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| run-1 | 2026-11-04T09:56:38Z | **PASS** | 600/600 | 932.8 / 957.4 | −24.55 ms (−2.56 %) | 1212.7 / 1221.6 | −0.73 % | 825.3 | 105.8 %; 83; 402/526 | 243.7/s, 130,982 req, 14 × 429 | 9 | 0 |
| run-2 | 2026-11-04T10:09:10Z | **PASS** | 600/600 | 981.5 / 989.0 | −7.58 ms (−0.77 %) | 1229.7 / 1280.2 | −3.95 % | 859.4 | 104.4 %; 80.5; 392/548 | 232.7/s, 130,121 req, 9 × 429 | 8 | 0 |
| run-3 | 2026-11-04T10:21:36Z | **INVALID** (1 non-401 probe) | 599/600 | 960.4 / 979.6 | −19.19 ms (−1.96 %) | 1249.9 / 1277.8 | −2.18 % | 842.1 | 106.8 %; 82.9; 413/538 | 237.2/s, 130,327 req, 17 × 429 | 9 | 0 |
| run-4-supplementary | 2026-11-04T10:31:43Z | **FAIL** (median diff +9.05 ms > 1 ms) | 600/600 | 938.3 / 929.3 | **+9.05 ms (+0.97 %)** | 1200.8 / 1240.5 | −3.19 % | 839.9 | 105.9 %; 84.8; 397/523 | 243.8/s, 130,214 req, 4 × 429 | 7 | 0 |

The raw data for each run is in its folder: `probes.csv`, `cpu.csv`, `load.json`, `smtp.json`, `meta.json`, `summary.json`.

### Findings as recorded (with status)

1. **Known vs unknown: within 5 % in every run, but the sign of the median difference is not stable.** *Status: open; see `acceptance-criterion.md`.*
   - Median differences ranged from −2.6 % to +1.0 % and p90 differences from −4.0 % to −0.7 %, with every counted probe on the `401` wrong-password path.
   - The median difference was −24.6, −7.6, −19.2 and +9.1 ms. Its run-to-run spread (about ±20 ms at ~950 ms latency, n = 200) is far larger than the 1 ms "not positive" tolerance.
   - Whether a run meets "≤ 1 ms" is therefore largely chance; run-4 did not.
   - As far as this data shows this is measurement noise, not a demonstrated oracle, but the agreed criterion is not met and is reported as such.
   - The later analysis puts numbers on this: with no true difference, a run meets the rule with probability ≈ 0.5, so 3 of 3 ≈ 0.125.
2. **Run-3 invalid: a pre-existing race in the rate-limit code, not the harness.** *Status: fixed by PR #17; related deadlock fixed by PR #18.*
   - An **unknown** address probe got `429` with `Retry-After` for a fresh address.
   - P1's log shows bursts of `security.sign_in_throttled` with `retryAfterSeconds: 0` for fresh addresses at the same millisecond, about once a minute.
   - Cause: `reserveAttempt()` (`src/server/services/rate-limit.ts`) writes the first-sight row with `INSERT IGNORE` and `expires_at = now`. The once-a-minute `purgeExpiredBucketsSometimes()` (`DELETE … WHERE expires_at < now`) can delete it before the following `UPDATE`, which then matches nothing, so the attempt is refused.
   - It hits known and unknown addresses alike (no account oracle) and fails closed, but a legitimate first sign-in could rarely see "Too many attempts". It also explains the flood's 4–17 `429`s per run.
   - Fixing it was a security-path code change needing owner approval; that approval was given and the fix merged as #17 (`ddecb2c`, 4 Nov 2026).
3. **"Listed" (allowlisted, no account) answers ~90–130 ms (≈ 10–14 %) faster than "known" in every run under saturation** (825–859 ms vs 933–982 ms). *Status: open; reinvestigated in `finding-3-allowlist-timing.md`.*
   - This is outside the D16 criteria (known vs unknown).
   - The recorded reading was that an observer who can saturate the server could tell an allowlisted staff address that has not created its account yet from one that has.
   - The reinvestigation corrects this. The difference comes from the allowlist check skipping one database query, so it separates **every** allowlisted address (activated or not) from every other address. It does not show activation status.
4. **Saturation.** *Status: informational.*
   - P1's median CPU was 104–107 % of one core in every run (the Node main thread plus the scrypt thread pool), meeting the stated criterion.
   - About 75 % of 1-second samples were ≥ 95 %; p10 was 80–85 % and the minimum about 40–55 % (brief dips). No CPU-stress process was used.
   - Every request was far above the 400 ms floor (`security.timing_floor_exceeded` logged throughout), as expected under saturation.
5. **The single-process test asserted `401` on every timed sample and cleared the global `class:K:*` windows before each known probe.** *Status: superseded by the revised test (see the status table above).*
   - With that, the floored known/unknown medians were 400.6 / 400.5 ms (p90 401.4 / 401.3) and under the in-process flood 400.3 / 400.3 ms, on MariaDB 11.8.9 in the same sandbox. The earlier concern (comparing 429 with 429) no longer applied to that test.

### For the owner (as recorded, with status)
- D16 as defined (three valid passing runs) was **not demonstrated**: 2 PASS, 1 INVALID, 1 supplementary FAIL.
- The options recorded then, with their status:
  - **(a) Fix the purge race and repeat three runs.** The fix is done (#17, #18); the runs wait for (b).
  - **(b) Restate the "not positive" tolerance in a form the noise allows.** Proposed in `acceptance-criterion.md`.
  - **(c) Waive D16 for first-admin activation.** Owner decision.
  - **(d) Assess finding 3.** See `finding-3-allowlist-timing.md`.
- Each is an owner decision; nothing was changed to make a run pass.
- These runs come from a 4-core cloud sandbox, not Hostinger; absolute latencies do not transfer.
