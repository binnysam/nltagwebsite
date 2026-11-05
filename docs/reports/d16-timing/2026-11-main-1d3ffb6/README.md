# D16 final runs on `main` at `1d3ffb6` (4 Nov 2026)

**Pooled verdict: PASS** (`scripts/d16/pooled.mjs`, exit code 0).
- Three valid runs, no invalid or replaced run.
- Rules A, B (all four comparisons), C, D and E all pass.

The plan is `../plan-2026-11.md`, pre-registered and unchanged. The owner approved starting the runs on 4 Nov 2026, after reviewing the pre-flight smoke-test report, with the connection count frozen at **256**.

**For owner review. Nothing here deploys, migrates, activates an account or changes production.**

## Verdict

| Rule | Applies to | Result | Value |
|---|---|---|---|
| **A** validity | each run | **PASS** ×3 | 2,400 / 2,400 probes `401` in every run; P1 median CPU 113.8 / 112.8 / 112.8 % (≥ 95 %) |
| **B** equivalence, 90 % CI inside ±5 % | L2–U (primary) | **PASS** | +0.886 % [−0.081, +1.838] |
| | K–U | **PASS** | +0.847 % [−0.210, +1.879] |
| | L0–U | **PASS** | +0.913 % [−0.160, +1.984] |
| | L2–L0 | **PASS** | −0.047 % [−1.078, +0.988] |
| **C** not slower, one-sided 95 % upper bound < +2.5 % | L2–U | **PASS** | +1.838 % |
| **D** tail, p90 ratio 90 % CI inside ±5 % | L2–U | **PASS** | −1.211 % [−2.621, +0.708] |
| **E** consistency, no run's 95 % CI entirely outside ±5 % | L2–U | **PASS** | run CIs: [+0.023, +3.645], [−3.700, +0.433], [+0.535, +4.612] |

**How to read these numbers:**
- Each value is the Hodges–Lehmann shift of log(ms) between two classes, as a percentage, averaged over the three runs.
- The intervals come from a round-block bootstrap stratified by run (2,000 resamples, seed 20261104).
- `pooled-summary.json` has every figure. Running `pooled.mjs` twice gave identical output apart from timestamps.

**Classes:**

| Code | Name in `probes.csv` | Shape |
|---|---|---|
| U | `unknown` | no account, not on the allowlist |
| K | `known` | account, not on the allowlist |
| L0 | `listed` | on the allowlist, no account |
| L2 | `listedAccount` | on the allowlist with an account: the shape of every production staff account |

## Per-run data

| Run | Started → recorded (UTC) | Probes `401` | Median U / K / L0 / L2 (ms) | p90 U / K / L0 / L2 (ms) | P1 CPU median; p10; samples ≥ 95 % | P2 flood | `timing_floor_exceeded` lines | SMTP connections | Former per-run criterion (information only) |
|---|---|---|---|---|---|---|---|---|---|
| run-1 | 20:50:54 → 21:33:50 | 2,400/2,400 | 1024.9 / 1045.5 / 1066.6 / 1057.5 | 1321.1 / 1274.9 / 1315.3 / 1292.4 | 113.8 %; 98.8; 2,379/2,549 | 627,591 req, 244.9/s, all `401`, 0 errors | 40 | 0 | FAIL (K−U median +20.6 ms > 1 ms) |
| run-2 | 21:44:32 → 22:29:14 | 2,400/2,400 | 1100.9 / 1085.2 / 1095.4 / 1080.4 | 1387.6 / 1397.1 / 1360.3 / 1352.9 | 112.8 %; 96.9; 2,431/2,642 | 623,718 req, 234.8/s, all `401`, 0 errors | 41 | 0 | PASS |
| run-3 | 22:39:46 → 23:24:44 | 2,400/2,400 | 1070.7 / 1102.3 / 1073.1 / 1091.4 | 1372.4 / 1433.9 / 1385.0 / 1387.3 | 112.8 %; 93.9; 2,368/2,657 | 623,637 req, 233.5/s, all `401`, 0 errors | 40 | 0 | FAIL (K−U median +31.6 ms > 1 ms) |

- **Medians and p90s** here are plain quantiles of `probes.csv` (linear interpolation), shown for orientation only. The verdict uses the pooled statistics above.
- **The former per-run criterion** is the "≤ 1 ms, not positive" rule from decision O5. The plan keeps it for information only, and `acceptance-criterion.md` finding 1 already showed that noise decides it. It is not the verdict.
- **Gaps between runs:**
  - run-1 → run-2: 10 min 42 s (21:33:51 → 21:44:33);
  - run-2 → run-3: 10 min 34 s (22:29:14 → 22:39:48).
- **No run was interrupted, invalid or replaced.**
  - The sandbox boot ID was the same before and after every run (`efad36a0-…`), so there was no restart.
  - Every harness process exited with 0.

## Observations (they do not change the verdict)
1. **Primary comparison, run by run.** L2 was slower than U in run-1 (+1.8 %) and run-3 (+2.5 %), with 95 % CIs that just exclude zero, and faster in run-2 (−1.7 %).
   - Rule E checks this pre-registered question: no run's interval lies entirely outside ±5 %. It passes.
   - The pooled upper bound of +1.84 % is below the +2.5 % margin of Rule C.
   - So, under this load, the data put any L2 penalty below about 2 %. They do not show it is zero.
2. **K–U in run-3** was +3.0 % (95 % CI [+0.8, +5.3]). Its upper end is above 5 %, but Rule E applies only to the primary comparison. The pooled K–U interval [−0.21, +1.88] is inside the margin.
3. **Finding 3 (allowlisted addresses answered faster) is not visible.**
   - L0–U is +0.9 % and L2–L0 is −0.05 %. Before the fix it was about −10 to −14 %.
   - This confirms, under saturation, the fix merged in PR #20.
4. **Every `timing_floor_exceeded` line was labelled `sign-in-unknown`** (121 over the three runs).
   - The flood is entirely unknown addresses, and the log line is rate-limited, so most lines come from flood requests.
   - Saturated requests take about 1 s, well over the 400 ms floor, as in the historical runs.

## Requirements of the approval, and how each was met

| Requirement | Evidence |
|---|---|
| Main commit `1d3ffb6` | `meta.json` → `commit` = `1d3ffb6cf0ced23958b63a90862dfd4efe1cdb38` and `worktreeClean: true` for every run. The runs used a separate detached worktree at that commit, so committing results to this branch never changed the code under test. |
| MariaDB 11.8.9 | `SELECT VERSION()` = `11.8.9-MariaDB-ubu2404` (`meta.json`, `environment-checks/`). |
| 256 connections, frozen | `meta.json` → `connections: 256` in all three runs; `pooled.mjs` reports no plan deviation. |
| Four classes, 600 per class, three runs | `pooled-summary.json` → `perRunChecks[].counts` 600 × 4 per run; `notPerPlan: []`. |
| ≥ 10 min between runs | 10 min 42 s and 10 min 34 s (above). |
| Database and server on localhost only | `environment-checks/run-N.txt`, taken during every run (the procedure is described below the table). |
| No production credentials, environment variables or real addresses | See "Isolation" below. |
| Fresh server and fresh rate-limit tables each run | See "Fresh state" below. |
| Raw results and logs preserved | Everything is in this folder, except P1's own log, which the plan keeps local (git-ignored). Copies of the three P1 logs exist only in the session sandbox and are available **only until that sandbox ends**; they are not published. They contain no addresses or secrets; publishing them needs the owner's explicit approval. *(Corrected 5 Nov 2026: this row said the copies "are kept".)* |
| Every run published | All three runs, as produced. There were no invalid runs to publish. |
| No change to rules, thresholds, sample counts or connections | No file in `scripts/d16/` or the plan was changed; the runs used commit `1d3ffb6` unchanged. |
| No deploy, production change, migration on production, or account activation | Nothing was deployed or merged. Hostinger and the production database were not contacted. The only migrations ran on the scratch database (`run.sh`, as in the plan). |

**How the localhost check was taken (`environment-checks/run-N.txt`), in every run:**
- **Database:** Docker publishes it only as `3306/tcp -> 127.0.0.1:3307`. This was checked before each run, and the wrapper refuses to start otherwise.
- **While P1 was running,** listening sockets were read from `/proc/net/tcp`:
  - P1 (`127.0.0.1:3200`), the SMTP sink (`127.0.0.1:2525`) and MariaDB (`127.0.0.1:3307`) listened on loopback only;
  - connecting to each of them on the sandbox's external address was refused.
- `0.0.0.0:2024` belongs to the sandbox's own infrastructure, not to the harness.

**Isolation:**
- **No production environment variables.** No `.env*` file was present (`run.sh` refuses otherwise). The build ran with only `PATH` and `HOME`. P1 runs under `env -i` with only the harness values.
- **Every run's precheck confirmed:**
  - no `DATABASE_URL`, `SMTP_*`, `BETTER_AUTH_*`, `NLTAG_*`, `CLIENT_IP_*`, `AUTH_RATE_LIMIT` or `HOSTINGER*` variable in the launching shell;
  - `CLIENT_IP_SOURCE` unset.
- **Secrets were local only.** The database passwords were random and generated for this session, and the auth secret was random per run with `harness-only` in it. None is written in this folder; this was checked by search before each commit.
- **No real addresses.** The scratch `user` table had 0 addresses outside `@nltag.test` after every run, and `probes.csv` contains no addresses (no `@`).
- **No mail could leave.** The SMTP sink recorded 0 connections in every run.

**Fresh state:**
- **New server per run.** Before each run the precheck required port 3200 to be free and no `next start` process to be running. After each run no `next start` process remained.
- **Empty rate-limit tables per run.** `run.sh` empties `rate_limit_bucket` and `rate_limit` before P1 starts and again after warm-up.
  - **run-1:** the scratch database was new, and its tables were created by run-1's own migration.
  - **run-2 and run-3:** a few seconds into the flood, `rate_limit_bucket` held 3,406 and 2,341 rows (run-1 and run-2 had left about 628,000 and 625,000), and `rate_limit` held 0.

## What did not go exactly as written (no effect on the plan's rules)
- **The pre-flight smoke test (`smoke-1`) is not in this folder.**
  - It was made and reported in an earlier session, and the owner reviewed that report before approving these runs.
  - Its raw folder was not pushed from that session's sandbox, which no longer exists, so it cannot be published from here.
  - The plan (§7) lists the smoke folder among the outputs. This is a publication gap, not a change to the runs: the smoke test is excluded from the verdict, and the connection count it fixed (256) was given in the approval.
  - Repeating the smoke test was not part of the approval, so it was not repeated.
- **The MariaDB image came from Google's mirror of Docker Hub, `mirror.gcr.io/library/mariadb:11.8.9`,** which serves Docker Hub's official images. *(Corrected 5 Nov 2026: this line called it "Docker Hub's official mirror".)*
  - Docker Hub answered `429 Too Many Requests`.
  - Same tag; the image ID was `sha256:c4124d1a…` and the server reports `11.8.9-MariaDB-ubu2404`.
  - The container was started with the plan's exact settings (`-p 127.0.0.1:3307:3306`, database `nltag_d16`, collation set to `utf8mb4_uca1400_ai_ci`).
- **The checkout was a separate worktree,** `git worktree add --detach … 1d3ffb6`, followed by `npm ci` and `npm run build`. The plan's `git checkout main && git pull` would have given the same commit, since `origin/main` was `1d3ffb6`.
- **A wrapper ran each run.** It is a scratch script, not part of the repository: it did the safety checks above and then called the unchanged `scripts/d16/run.sh`. Each run's console output is in `logs/`.

## Environment
- **Machine:** cloud sandbox, Intel Xeon Processor @ 2.80 GHz × 4, Ubuntu 24.04, Node v22.23.4.
- **Processes:** P1 `next start` (production build) on cores 0–1; P2 on cores 2–3; P3 on core 3. The database container was not pinned. `D16_STRESS=0`, ramp 10 s.
- **Database:** MariaDB 11.8.9 (Docker 29.9.2) on 127.0.0.1:3307, scratch database `nltag_d16`.

## Files
- **`run-1/`, `run-2/`, `run-3/`:** `probes.csv`, `cpu.csv`, `load.json`, `smtp.json`, `meta.json`, `summary.json`, exactly as `run.sh` wrote them.
- **`pooled-summary.json`:** output of `node scripts/d16/pooled.mjs run-1 run-2 run-3`.
- **`environment-checks/run-N.txt`:** the pre-run, mid-run and post-run checks.
- **`logs/run-N.console.log`, `logs/pooled.console.log`:** the console output of each run and of the analysis.

## What this PASS shows, and what it does not (plan §8)
- **It shows** that under one saturating load shape, on this sandbox, three kinds of address were each answered within the agreed margins of an address without an account (U):
  - an allowlisted account given a wrong password (L2);
  - a non-allowlisted account given a wrong password (K);
  - an allowlisted address without an account (L0).
- **It does not show** behaviour on Hostinger's hardware or behind its CDN, or under other load shapes.
- **The password-reset request path is out of scope.** It is a separate production-readiness item.
