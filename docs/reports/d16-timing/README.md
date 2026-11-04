# D16 timing evidence — runs made for readiness PR C (4 Nov 2026)

Harness and procedure: `scripts/d16/README.md`. Criteria (owner decision O5, 4 Nov 2026), known vs unknown, per run: every timed probe `401`; P1 saturated (median 1-s CPU ≥ 95 % of one core); |median diff| < 5 % and |p90 diff| < 5 %; median(known) − median(unknown) ≤ 1 ms. D16 needs **three independent valid runs that all pass.**

**Result: D16 is NOT met by these runs.** Of the three planned independent runs, two pass and one is **invalid** (one probe answered `429`, cause below). A fourth, supplementary run, made afterwards with the identical harness and reported here unchanged, **fails** the "not positive" criterion (+9.05 ms). No run was discarded, re-labelled or re-analysed. The owner decides what this evidence supports (§ "For the owner").

## Environment (same for every run)
- Application code: `main` at `b4e37a8` (R4 v6.1 as deployed), production build (`next build`, `next start`, `NODE_ENV=production`). The readiness changes in PRs A, B and D were not included. The harness ran from the uncommitted PR C working tree on top of `b4e37a8`; `meta.json` → `commit` records that base.
- Cloud sandbox VM: Intel Xeon @ 2.10 GHz × 4 cores, Node v22.23.4. MariaDB `11.8.9-MariaDB-ubu2404` in Docker (container not pinned), scratch database `nltag_d16`.
- P1 on cores 0–1, P2 (256 connections) on cores 2–3, P3 on core 3. `D16_STRESS=0`. N = 200 probes per class (known, unknown, listed). Ramp 10 s. Fresh P1 process and fresh rate-limit tables for every run; 3 minutes between runs 1→2→3.
- Local SMTP sink: 0 connections in every run (no mail traffic).
- `meta.json` → `startedAt` is in fact written when the run **ends** (a naming slip in `run.sh`, corrected to `recordedAt` for future runs; the committed `meta.json` files are left exactly as produced).

## Results

| Run | Recorded (UTC, end) | Verdict | Probes `401` | Median known / unknown (ms) | Median diff | p90 known / unknown (ms) | p90 diff | Median listed (ms) | P1 CPU, % of one core (median; p10; seconds ≥ 95 %) | P2 load | `timing_floor_exceeded` lines | SMTP |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| run-1 | 2026-11-04T09:56:38Z | **PASS** | 600/600 | 932.8 / 957.4 | −24.55 ms (−2.56 %) | 1212.7 / 1221.6 | −0.73 % | 825.3 | 105.8 %; 83; 402/526 | 243.7/s, 130,982 req, 14 × 429 | 9 | 0 |
| run-2 | 2026-11-04T10:09:10Z | **PASS** | 600/600 | 981.5 / 989.0 | −7.58 ms (−0.77 %) | 1229.7 / 1280.2 | −3.95 % | 859.4 | 104.4 %; 80.5; 392/548 | 232.7/s, 130,121 req, 9 × 429 | 8 | 0 |
| run-3 | 2026-11-04T10:21:36Z | **INVALID** (1 non-401 probe) | 599/600 | 960.4 / 979.6 | −19.19 ms (−1.96 %) | 1249.9 / 1277.8 | −2.18 % | 842.1 | 106.8 %; 82.9; 413/538 | 237.2/s, 130,327 req, 17 × 429 | 9 | 0 |
| run-4-supplementary | 2026-11-04T10:31:43Z | **FAIL** (median diff +9.05 ms > 1 ms) | 600/600 | 938.3 / 929.3 | **+9.05 ms (+0.97 %)** | 1200.8 / 1240.5 | −3.19 % | 839.9 | 105.9 %; 84.8; 397/523 | 243.8/s, 130,214 req, 4 × 429 | 7 | 0 |

Raw data per run in its folder: `probes.csv`, `cpu.csv`, `load.json`, `smtp.json`, `meta.json`, `summary.json`.

## Findings

1. **Known vs unknown: within 5 % in every run** (median −2.6 % … +1.0 %, p90 −4.0 % … −0.7 %), with every counted probe on the `401` wrong-password path. The **sign of the median difference is not stable** (−24.6, −7.6, −19.2, +9.1 ms) and its run-to-run spread (~±20 ms at ~950 ms latency, n = 200) is far larger than the 1 ms "not positive" tolerance. Whether a run meets "≤ 1 ms" is therefore largely chance; run-4 did not. This is measurement noise as far as this data shows, not a demonstrated oracle, but the agreed criterion is not met and is reported as such.
2. **Run-3 invalid — a pre-existing race in the rate-limit code (not the harness).** An **unknown** address probe got `429` with `Retry-After` for a fresh address. P1's log shows bursts of `security.sign_in_throttled` with `retryAfterSeconds: 0` for fresh addresses at the same millisecond about once a minute. Cause: `reserveAttempt()` (`src/server/services/rate-limit.ts`) first-sight `INSERT IGNORE` writes the row with `expires_at = now`; the once-a-minute `purgeExpiredBucketsSometimes()` (`DELETE … WHERE expires_at < now`) can delete it before the following `UPDATE`, which then matches nothing, so the attempt is refused. It hits known and unknown addresses alike (no account oracle) and fails closed, but a legitimate first sign-in can rarely see "Too many attempts". This also explains the flood's 4–17 `429`s per run. Fixing it is a security-path code change: **owner approval needed** (not done here).
3. **"Listed" (allowlisted, no account) answers ~90–130 ms (≈ 10–14 %) faster than "known" in every run** under saturation (825–859 ms vs 933–982 ms). Outside the D16 criteria (known vs unknown), but it means an observer who can saturate the server could tell an allowlisted staff address that has not created its account yet from one that has. Low impact (staff addresses only, saturation needed, 10 known addresses here); reported for the owner's assessment.
4. **Saturation:** P1's median CPU was 104–107 % of one core in every run (the Node main thread plus the scrypt thread pool), meeting the stated criterion. About 75 % of 1-second samples were ≥ 95 %; p10 was 80–85 % and the minimum ~40–55 % (brief dips). No CPU-stress process was used. Every request was far above the 400 ms floor (`security.timing_floor_exceeded` logged throughout), as expected under saturation.
5. The single-process test (`tests/integration/r4-timing.test.ts`) now asserts `401` on every timed sample and clears the global `class:K:*` windows before each known probe. With that, the floored known/unknown medians were 400.6 / 400.5 ms (p90 401.4 / 401.3) and under the in-process flood 400.3 / 400.3 ms, on MariaDB 11.8.9 in the same sandbox: the earlier concern (comparing 429 with 429) no longer applies to that test.

## For the owner
- D16 as defined (three valid passing runs) is **not demonstrated**: 2 PASS, 1 INVALID, 1 supplementary FAIL.
- Options: (a) fix the purge race (finding 2) and repeat three runs; (b) restate the "not positive" tolerance in a form the noise allows (for example a bootstrap confidence bound on the difference, or a tolerance relative to run-to-run spread); (c) waive D16 for first-admin activation; (d) assess finding 3. Each is an owner decision; nothing here was changed to make a run pass.
- These runs are from a 4-core cloud sandbox, not Hostinger; absolute latencies do not transfer.
