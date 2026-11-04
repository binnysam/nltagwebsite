# D16 finding 3: allowlisted addresses answer faster under load

**Status: fixed, merged to `main` in PR #20 (`21c4b3a`, 4 Nov 2026).** Option 1 below was owner-approved on 4 Nov 2026.
- Results with the fix are in "Fix (PR #20) and verification" below.
- Confirmation under real CPU saturation is part of the final D16 runs (`plan-2026-11.md`, primary comparison: allowlisted account vs unknown).
- Investigated on 4 Nov 2026, on current `main` (`0d77c75`, merged into PR #16).
- PR #16 contained no production code; the fix came separately in PR #20.
- Accounts are still off in production (`/api/auth` answers 404), so nothing is exposed today.

## Summary
- **What happens:** under load, a failed sign-in for an address on `NLTAG_SIGNUP_ALLOWLIST` is answered faster than for an address that is not on it, by the time of one database query. This reproduces on current main.
- **Cause:** `isKnown()` in `src/server/security/auth-abuse-gate.ts` returns early for allowlisted addresses, so it skips the user `SELECT` that every other address runs.
  - That query falls in the request's own pre-reservation time (`commonMs`).
  - The adaptive hold adds `commonMs` to its target rather than padding it.
  - At normal load every failure is held to the fixed 400 ms floor and nothing shows. Once `commonMs` + 1.1 × the slowest recent password work exceeds 400 ms (CPU saturation, a slow database), the skipped query shows one for one.
- **What it reveals: allowlist membership, not activation status.** Three allowlisted states answer the same as each other, within about 2 ms:
  - no user row;
  - a user row with no password (what an account request leaves);
  - a full account.

  Every production account is created through the allowlist. So in production, under load, the signal separates staff addresses, activated or not, from every other address. In effect it is an account-existence signal for staff.
- **The original report framed it differently.** It compared "listed" (allowlisted, no account) with "known" (an account **not** on the allowlist). That is a difference in allowlist membership, not in activation.
- **Exploitability:** possible from outside in principle, but it needs the site held under sustained saturation, which is itself a denial of service, and a few dozen counted attempts per guessed address. Likelihood is low and impact low to moderate: it confirms which addresses are staff accounts and grants no access.
- **Mitigation (owner-approved 4 Nov 2026; merged to `main` in PR #20 (`21c4b3a`, 4 Nov 2026)):** run the same `SELECT` for every address before the allowlist check, a two-line change. It leaves limits, thresholds, expiry periods, statuses and the set of addresses treated as known unchanged. Measured in a throwaway copy: the difference disappears (within ±1.5 ms).

## Evidence

### 1. Historical saturation runs
These are the two-process harness runs on `b4e37a8`, now superseded.

| Run | Allowlisted no-account vs unknown, median difference | 95 % CI |
|---|---|---|
| run-1 | −132.1 ms | [−175.2, −84.5] |
| run-2 | −129.6 ms | [−190.5, −66.1] |
| run-3 | −138.8 ms | [−170.9, −97.0] |
| run-4-supplementary | −89.4 ms | [−150.7, −48.5] |

Source: `node scripts/d16/criterion-evidence.mjs …/probes.csv`.

The code involved (`isKnown`, `signIn`, `holdUntil`, the estimator) is identical on current main. The only change to this file since `b4e37a8` is the verification-purge trigger from PR #13.

### 2. Controlled experiment on current main
Setup:
- **Tooling:** `scripts/d16/finding-3/`, one process, local MariaDB 11.8.9.
- **Load stand-in:** a loopback TCP proxy adds a fixed delay to every database round trip. This stands in for a loaded server, where every awaited query costs more.
- **Allowlist:** an explicit, production-shaped allowlist.
- **Probes:** five classes interleaved with rotating order, 40 rounds, every probe `401`. Per-address keys and K windows are cleared before each probe.

The five classes:
- **U:** no account, not allowlisted (a fresh address each probe);
- **K:** an account with a password, not allowlisted (the harness's "known");
- **L0:** allowlisted, no user row (the harness's "listed");
- **L1:** allowlisted, a user row without a password;
- **L2:** allowlisted, an account with a password (the shape of a production staff account).

Median difference from U in ms (95 % CI). There are two independent runs per configuration: the first column was made with scratch copies of the same files, the second with the committed tooling.

| Configuration | U median | K | L0 | L1 | L2 |
|---|---|---|---|---|---|
| main, no added latency | 400.6 / 400.8 | +0.1 / −0.2 | −0.0 / −0.4 | +0.1 / −0.3 | +0.2 / −0.3 |
| main, +50 ms per round trip | 782.4 / 743.3 | −0.5 / −1.4 [−4.6, +1.9] | **−51.6 / −54.4** [−56.9, −50.3] | **−51.4 / −53.0** [−55.9, −50.1] | **−50.8 / −52.3** [−55.5, −49.3] |
| candidate mitigation, +50 ms | 776.9 / 750.2 | −0.4 / −0.4 | +0.5 / −1.1 [−10.1, +5.9] | +0.1 / −0.5 [−12.9, +4.7] | −0.9 / −1.5 [−9.7, +6.6] |

The CIs shown are from the committed-tooling run.

How to read it:
- With no added latency, every class sits on the 400 ms floor: no leak at idle.
- With 50 ms per round trip, every allowlisted class is 50–54 ms faster than U and K, which is exactly one query. L0, L1 and L2 cannot be told apart, and K cannot be told apart from U.
- With the mitigation, all five classes are within 1.5 ms of each other and every interval includes 0.

To reproduce, use a local `*_test` database (it is emptied):

```bash
F3_DB_URL='mysql://<user>:<pass>@127.0.0.1:3306/f3_test' scripts/d16/finding-3/run.sh 50 40
```

To check the mitigation, apply the diff below to a throwaway copy and run the same command there.

### 3. Mechanism
`signIn()` does this, in order:
1. Reads the body and validates it.
2. Calls `isKnown(email)`. An allowlisted address gets an answer straight away; every other address costs one indexed `SELECT` on `user`.
3. Reserves a per-address slot.
4. Records `commonMs = now − started`.

Every failure is then held until `max(400 ms, commonMs + 1.1 × max(last 32 password-work samples))`:
- The work part is padded to the slowest recent sample. That hides differences inside Better Auth: a dummy hash for no account or no password, a verify for a real account, and an extra account lookup.
- `commonMs` is the request's own time and is not padded. A query skipped before the reservation therefore shows directly once the target is above the floor.
- Under CPU saturation, each awaited query costs a queueing delay: about 90–140 ms in the sandbox runs. With injected latency it costs the injected delay.

Why existing checks missed it:
- **The in-process tests:** `tests/integration/r4-timing.test.ts` runs without an allowlist. Outside production the policy is then "open" and the gate treats every address as allowlisted. It also runs at idle, where the floor hides everything (the first row of the table).
- **The D16 harness:** its "known" class is accounts that are not on the allowlist, which is not the production shape.

## Exploitability
- **Preconditions:**
  1. The site must stay in the regime where failures exceed the 400 ms floor. In the sandbox that took about 240 requests/s from 256 connections against a Node process pinned to 2 cores; a slow database would also do it.
  2. The attacker needs a candidate address.
  3. The attacker needs enough counted attempts on that address.
- **Signal:** about 9–14 % of the answer time under saturation (89–139 ms at ~950 ms).
- **Samples needed:** with the sandbox's noise, about 35 counted attempts on one address, compared with fresh random addresses, give 95 % confidence and 90 % power for a 12 % difference (`criterion-evidence.mjs`).
  - The per-address schedule allows 5 attempts at once, then spacing of 30 s, 1, 2, 4 and 8 minutes, then 15 minutes: about 100 a day.
  - So under continuous saturation this takes well under a day. Internet jitter adds noise and raises the count somewhat.
- **What limits or exposes the attempt:**
  - The flood slows or denies the site for everyone, which is visible to the owner and possibly to Hostinger's CDN. Whether the CDN rate-limits such a flood was not verified.
  - Every wrong-password probe on an allowlisted address takes a slot in the global K ceiling (90 per 15 minutes). When it is full, every known address gets 429.
  - The ceiling 429 includes `commonMs`, so it carries the same difference.
  - Per-address refusals (`sign-in-429`) are held without `commonMs`, so they are inferred **not** to carry it. This was not measured.
  - Once an address with a user row (L1 or L2) is throttled, its holder receives the "sign-in throttled" alert email (`alertAccountHolder`), once per alert window.
- **Today:** accounts are off in production, so this applies only after activation.

## What it reveals

| Address | Distinguishable from an unknown address under load? |
|---|---|
| Account, not on the allowlist (K) | No |
| On the allowlist, no row (L0) | **Yes**, faster |
| On the allowlist, row without password (L1) | **Yes**, faster, same as L0 and L2 |
| On the allowlist, full account (L2) | **Yes**, faster, same as L0 and L1 |

- **Allowlist membership:** yes. In production that covers every staff address, activated or not.
- **Activation status:** no. L0 → L1 → L2 does not change the timing, so repeated measurement over time does not show when an account is activated.
- **Account existence outside the allowlist:** no. K and U are indistinguishable.

## Mitigation options (option 1 approved and merged to `main` in PR #20 (`21c4b3a`, 4 Nov 2026))

1. **Recommended: a uniform lookup in `isKnown()`.**

   ```diff
    async function isKnown(email: string): Promise<boolean> {
   -  if (signupPolicy().kind === "allowlist" && signupAllowed(email)) return true;
      const [row] = await getDb().select({ id: userTable.id }).from(userTable).where(eq(userTable.email, normaliseEmail(email))).limit(1);
   -  return Boolean(row);
   +  return Boolean(row) || (signupPolicy().kind === "allowlist" && signupAllowed(email));
    }
   ```

   - **Effect:** measured above.
   - **Cost:** one indexed `SELECT` per sign-in attempt on an allowlisted address.
   - **Unchanged:** limits, thresholds, expiry periods, statuses, reservation order, alerts, and which addresses are treated as known.
   - **Tests to ship with it:**
     - a regression test with added database latency, asserting that allowlisted and unknown medians agree within a tolerance (it fails on current main, so it must land with the fix);
     - a production-shaped allowlist for that test.

   This is a security behaviour change, so it needs owner approval.
2. **Defence in depth (not recommended now):** pad the pre-reservation part too, by holding to `max(floor, expected common + expected work)`.
   - This would hide any future difference before the reservation, not only this query.
   - It is a wider change, makes failures slower under load, and needs its own design and approval.
3. **Operational interim (no code, owner only, hPanel):** keep the allowlist to addresses that still need to activate, and remove an address once its account is active.
   - An active account that is off the allowlist behaves like K, which is indistinguishable.
   - Sign-in and password reset for existing accounts do not depend on the allowlist.
   - However, `/api/account-request` no longer sends a reset link to an unlisted address, and the first-admin bootstrap needs the address on the list when it runs.
   - This narrows the exposure but does not remove it.
4. **Edge rate limiting** for `/api/auth` at Hostinger's CDN makes saturation harder and also helps against denial of service. It is outside the application and is a decision for the owner and Hostinger.

**Recommendation (as written before the decision):**
- Approve option 1 as a small separate security PR, with its regression test, before the first Church Admin activation. *Done: owner-approved 4 Nov 2026, PR #20.*
- Add the allowlisted-account class to the D16 design (`acceptance-criterion.md` §3) so the runs measure the production shape.

## Fix (PR #20) and verification

- **Code** (`src/server/security/auth-abuse-gate.ts`): option 1 exactly, i.e. the two-line diff above, plus a function comment saying every address must do the same lookup before the reservation. `isKnown()` returns the same result for every input. Limits, thresholds, expiry periods, statuses, alerts and audit are unchanged. No migration, dependency, environment or Tamil change.
- **Regression test** (`tests/integration/r4-allowlist-lookup.test.ts`, deterministic, no timing):
  - Uses an explicit staff allowlist, with fixtures made through the real account-request and set-password routes.
  - Records every statement sent through `getPool().query` during a wrong-password sign-in.
  - Requires exactly one user lookup by email before the first `rate_limit_bucket` statement.
  - Results:

    | Address | `main` without the fix | With the fix |
    |---|---|---|
    | Allowlisted, no account | fails (no lookup before the reservation) | passes |
    | Allowlisted, account requested, no password | fails | passes |
    | Allowlisted, active account | fails | passes |
    | Not allowlisted, active account | passes | passes |
    | Not allowlisted, no account | passes | passes |

- **Suites with the fix** (local, MariaDB 11.8.9): `npm run verify` passes (257 unit tests), and `npm run test:integration` gives 251/251 plus 6/6, with no existing test changed.
- **Timing harness** (`scripts/d16/finding-3/run.sh 50 40`, same session, both runs back to back). Median difference from an unknown address, ms, with 95 % CI:

  | Code | K | L0 | L1 | L2 |
  |---|---|---|---|---|
  | `main` `0d77c75` | 0.0 [−1.7, +2.4] | **−51.5** [−53.7, −49.0] | **−52.9** [−54.7, −50.3] | **−52.0** [−53.7, −50.2] |
  | PR #20 `ecf8535` | +0.7 [−8.6, +7.7] | −0.6 [−10.1, +6.0] | −0.9 [−11.9, +5.0] | +0.4 [−8.7, +6.7] |

  The unknown-address medians were 730.5 and 731.2 ms. With no added latency, every class is on the 400 ms floor in both versions, and every probe returned `401`.

**Not investigated here:** the password-reset request path holds to its own 250 ms floor plus the same estimator, but runs different Better Auth work for existing addresses. It was not measured, and it deserves the same check.
