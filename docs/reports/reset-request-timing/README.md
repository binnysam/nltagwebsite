# Forgot-password request timing: before and after the fix

Security-readiness review of 5 Nov 2026, item 4. The behaviour and the rule are described in `docs/backend/data-and-auth.md` → "Reset request: answered before the lookup".

## Method
- **Harness:** `scripts/d16/finding-3/reset-run.sh`, which runs `reset-timing.probe.ts` through `reset.vitest.config.ts`.
  - One Node process, calling the real `/api/auth` route, so the requests pass through the gate and its real 250 ms hold.
  - 40 interleaved rounds per address shape.
  - Every probe answered `200`.
- **Database:** scratch MariaDB 11.8.9 in Docker, published only on 127.0.0.1, database `rt_test`.
- **Delay:** `latency-proxy.mjs` adds the stated delay to every database response.
- **Before each probe:** the address's reset window and mail caps are cleared.
- **After each probe:** the reset job and its mail are awaited outside the timed window.
- **Shapes:**
  - U: no account (a fresh address every probe);
  - K: an account, not on the allowlist;
  - L1: on the allowlist, account requested, no password;
  - L2: on the allowlist, active account.
- **Statistic:** the median difference against U, with a seeded bootstrap 95 % interval (`reset-summarize.mjs`). The raw CSVs are in `before-1d3ffb6/` and `after/`; every summary line is in `summary.txt`.
- **Allowlisted, no account (L0):** covered by `tests/integration/r4-reset-request.test.ts`, not by this probe.

## Results (median difference against U, ms)

| Delay per round trip | Before (`main` `1d3ffb6`): K / L1 / L2 | After (this PR): K / L1 / L2 |
|---|---|---|
| 0 | −0.3 / −0.2 / −0.3 | −0.0 / −0.0 / +0.2 |
| 20 ms | −0.1 / −0.4 / −0.2 | −0.0 / +0.2 / −0.0 |
| 30 ms | **+40.3 / +40.1 / +39.6** | −0.0 / +0.1 / −0.0 |
| 50 ms | **+208.1 / +208.4 / +207.0** | +0.0 / +0.1 / +0.1 |

**After the fix:** every 95 % interval includes 0 and lies within ±0.4 ms, and U's median is 250.7 ms at every delay. Before the fix, at 50 ms the unknown address itself took 265.3 ms and an account 472–474 ms.

The "after" figures were measured on the final version of this PR, in which the job uses Better Auth's server API. The first version, which went through the HTTP handler, measured the same: every difference within ±0.2 ms.

## In-suite check
`tests/integration/r4-reset-request.test.ts` delays every pool statement in the process. It covers U, K, L0, L1 and L2 at 0, 20, 30 and 50 ms. With the fix, every median falls within 249.8–252.0 ms.

**Mutation check:** the pre-fix synchronous path was put back in a scratch copy, which was not committed. Against it:
- the statement-order test fails at any delay;
- the 50 ms timing test fails (K, L1 and L2 about 317 ms against U at 263 ms).

The in-process delay is milder than the proxy, one delay per statement rather than per round trip, so at 30 ms it does not reproduce the gap. The deterministic statement-order test is the guard for every delay.
