# D16 — two-process sign-in timing harness (test-only)

Answers the owner's D16 decision (post-deployment review `NLTAG-R4-POST-DEPLOYMENT-READINESS.md` §6, decision O5, 4 Nov 2026): under a saturating load, a wrong password for an address **with** an account must not take measurably longer or shorter than for an address **without** one.

**Scratch only.** A loopback server built from this checkout, a scratch MariaDB, a local SMTP sink and fictional `@nltag.test` addresses. Never the production database, production SMTP, the Hostinger environment, `nltagkuwait.com` or a real address. The scripts refuse a non-loopback server or database, a database whose name lacks `d16`, a secret without `harness-only`, and non-`@nltag.test` addresses. The site's production env guard refuses every harness value (`harness-only` secret, `SMTP_USER=harness`, loopback SMTP) on the live site.

## Processes

| | What | Where |
|---|---|---|
| **P1** | the server under test: `next start` (production build, `NODE_ENV=production`, accounts on, `AUTH_RATE_LIMIT=on`, `CLIENT_IP_SOURCE` unset), `http://127.0.0.1:3200` | its own OS process, pinned with `taskset` (default cores `0-1`) |
| **P2** | `load.mjs`: flood of `POST /api/auth/sign-in/email`, a fresh random unknown address per request, 256 keep-alive connections | its own OS process (default cores `2-3`) |
| **P3** | `probe.mjs`: sequential timed probes, interleaved, class order rotating every round: **known** (one of 10 fictional accounts, wrong password), **unknown** (fresh address, no account, not listed) and **listed** (allowlisted, no account: Better Auth's dummy hash). N = 200 per class | its own OS process (default core `3`) |
| sink | `smtp-sink.mjs` on `127.0.0.1:2525`: answers the greeting, offers no STARTTLS, so the site's transport (requireTLS) can never deliver; it only counts connections | |
| cpu | `cpu.mjs`: P1's CPU (process tree) from `/proc` every second, in % of one core (as `pidstat`) | |

Before **every** known or listed probe, P3 deletes that address's `signin-acct:<hash>` key **and every `class:K:*` window** in the scratch database, so every timed request takes the wrong-password path (review §6.2: without this the global K ceiling fills and both classes get the same `429`). The status of every probe is recorded.

## Criteria (owner decision, 4 Nov 2026) — per run, known vs unknown

1. Every timed probe answered **`401`**. Otherwise the run is **INVALID** (it measured the wrong path) — not a pass.
2. P1 saturated: the median 1-second CPU sample during the probe window is **≥ 95 %** of one core. Otherwise **INVALID (not saturated)**; repeat with more connections or `D16_STRESS=k` (k busy loops pinned to P1's cores, representing a busy shared host).
3. `|median(known) − median(unknown)| / median(unknown) < 5 %` **and** the same for p90.
4. "Not positive": `median(known) − median(unknown) ≤ 1 ms`.

D16 is met only by **three independent runs** (fresh P1 process, fresh buckets, separate times) that are all valid and all pass. `analyze.mjs` prints a verdict per run and writes `summary.json`; it never combines runs.

## Reproduce

Needs Linux (`/proc`, `taskset`), Node 22, Docker.

```bash
docker run -d --name nltag-d16-db -e MARIADB_ROOT_PASSWORD=<local-only> -e MARIADB_DATABASE=nltag_d16 \
  -e MARIADB_USER=nltag -e MARIADB_PASSWORD=<local-only> -p 3306:3306 mariadb:11.8.9
```

```bash
docker exec nltag-d16-db mariadb -uroot -p<local-only> -e "ALTER DATABASE nltag_d16 CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci;"
```

```bash
npm ci && npm run build
```

```bash
D16_DB_URL='mysql://nltag:<local-only>@127.0.0.1:3306/nltag_d16' scripts/d16/run.sh run-1
```

Repeat with `run-2` and `run-3` at separate times. Each run writes `docs/reports/d16-timing/<run>/`:
`probes.csv` (raw: `seq,round,class,position,status,ms` — client wall time, no addresses), `cpu.csv` (`t_ms,cpu_percent,pids`), `load.json` (P2 request count, rate, statuses), `smtp.json` (sink connections), `meta.json` (commit, database version, cores, settings, probe window, `security.timing_floor_exceeded` log-line count) and `summary.json` (medians, p90, differences, checks, verdict). P1's own log stays local (`.p1.log`, git-ignored). No credential, secret or database URL is written.

Options (environment): `D16_CONNECTIONS` (256), `D16_N` (200), `D16_RAMP_S` (10), `D16_P1_CPUS` (`0-1`), `D16_P2_CPUS` (`2-3`), `D16_P3_CPUS` (`3`), `D16_STRESS` (0), `D16_PORT` (3200), `D16_SMTP_PORT` (2525). The database container can be pinned away from P1 with `docker update --cpuset-cpus 2-3 nltag-d16-db`; record it if you do.

`docs/reports/d16-timing/README.md` records the runs actually made for the readiness PR, with their verdicts. Those runs tested `b4e37a8` and are superseded; no runs have been made on current `main` yet.

Related tooling (read-only or scratch-only; neither changes the criteria above):
- `criterion-evidence.mjs` reads committed `probes.csv` files and prints how precise a run is, plus what a confidence-based criterion would need (finding 1). The proposal is in `docs/reports/d16-timing/acceptance-criterion.md`.
- `finding-3/` is a one-process experiment with added database latency, comparing allowlisted, account and unknown addresses (finding 3). Results are in `docs/reports/d16-timing/finding-3-allowlist-timing.md`.

Before the next runs: the classes will include an allowlisted account, the production shape (finding 3), and the analysis is to be agreed and committed first (`acceptance-criterion.md` §4).
