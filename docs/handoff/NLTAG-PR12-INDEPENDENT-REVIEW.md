# NLTAG R4 v6.1 — PR #12 Independent Review

4 Nov 2026 (Kuwait) · Claude Cloud, review only. PR #12 `security/r4-v6.1-mailbox-first`, head `dc19f1f`. Nothing was modified, committed, pushed, merged or deployed; no production system was accessed.

**Evidence labels:** **[V]** verified by this review · **[A]** PR author's claim, not independently verified · **[I]** reviewer inference.

**Spec used:** `NLTAG-R4-v6.1-DESKTOP-HANDOFF.md` is not in the project docs or the repository, so the review is against `NLTAG-R4-v6.1-DECISION-ADDENDUM.md` and `NLTAG-R4-v6-SPEC-SUMMARY.md` (which the handoff is described as implementing). Any requirement that exists only in the handoff document was not checked.

**How it was checked:** fresh clone of PR head; GitHub API (read-only) for PR state, check runs and job logs; local scratch environment with MariaDB **10.11.14** (Docker Hub and the MariaDB 11.8 repository were not reachable from this sandbox): `npm run verify`, both integration configs, the timing test ×3, and the browser suites with local Chrome against fictional `@nltag.test` data.

---

## 1. Verdict: **READY AFTER FIXES**

No critical or high security defect found in the gate, route table, G1, G2, oracle fix, audit parity, revocation, recovery-code helper, reset-token handling, or env guard. Merge is blocked by a **red CI** (admin browser job failed; the two-factor browser suite never ran on 11.8.9) and by the **rewritten sign-up browser test failing** locally. Because every merge to `main` auto-deploys to Hostinger, the pre-merge environment check in §9 also applies.

## 2. GitHub and CI [V]

| Item | Result |
|---|---|
| PR state | open, not draft, not merged; base `b48261d`; 50 files, +3088/−420; `mergeable_state: unstable` |
| Head SHA | `dc19f1f4874e7fd4721203cdbd2e5e4aceeb1d51` ✅ matches |
| Workflow run | CI #41709104818 (pull_request, attempt 1) → **failure** |
| `verify` job | ✅ success. MariaDB `11.8.9-MariaDB-ubu2404` confirmed by the version step. `npm audit` (high) passed; token audit, Tamil check, lint (no output = 0 errors/0 warnings), typecheck, **unit 248/248**, build; **integration 209/209**; **production integration 6/6** |
| `public-browser` | ✅ 97 passed, 5 skipped (accounts off by design) |
| `admin-browser` | ❌ **failed**: `[desktop-1280] admin.spec.ts:82 Church Admin dashboard` timed out at `signIn` → `waitForURL(/account)` after the TOTP submit. **4 desktop admin tests did not run.** The following step **"Two-factor browser tests" did not run at all** (skipped after the failure) |
| Root cause in log | Server: `ER_LOCK_DEADLOCK` in Better Auth `findVerificationValue` → `DELETE FROM verification WHERE expires_at < ?` (its built-in cleanup on every lookup) at the moment both browser projects submitted a TOTP code in the same step (`freshStep()` aligns them) |
| Prior runs | Same deadlock string absent from the last 5 CI runs (main `b48261d`, `4b9e3a0`; client-ip branch ×3) |
| Commits | **8**, not 7: `e929bc1` "R4 v6 candidate patch (reference)" + v6.1 commits 1–7 in the addendum's order (0a35848 B+G1 · 165d06b D9 · fdd6e85 D2 · f62667f A · 2465721 C · c7d6b4f D · dc19f1f G2/§5/§2/§1). "Each commit green" is **not verified**: CI ran on the head only; commits 5–7 share one timestamp [I: squashed/split after the fact] |

## 3. Security findings

**Critical:** none. **High:** none.

### Medium
**M1 — CI red; 2FA browser coverage missing on 11.8.9; latent verification-table deadlock.**
Files: Better Auth `internal-adapter.mjs` (`findVerificationValue` cleanup); `src/server/auth/auth.ts` (`verification: { storeIdentifier: "hashed" }`, no `disableCleanup`); `tests/e2e/admin.spec.ts:44`.
[V] Two concurrent verification lookups produced a 500 and blocked a Church Admin sign-in in CI. [V] Three local admin runs (10.11) and the two-factor suite (8/8) passed with no deadlock. [I] Most likely a pre-existing Better Auth race that the PR did not introduce (the PR adds no writer to `verification` on the sign-in path; the gate's `liveResetToken` is a plain SELECT), but this is not proven. Production impact after activation: an occasional 500 on a 2FA verify or reset when two verifications coincide — rare on this site, not a security bypass.

**M2 — Rewritten sign-up (mailbox-first) browser test fails; sign-in lands on a stale "email verified" page.**
Files: `src/app/[locale]/(account)/AuthForm.tsx` (sign-in passes `callbackURL: /${locale}/verify-email`), `src/app/[locale]/(account)/verify-email/page.tsx`, `tests/e2e/auth.spec.ts:76–115`.
[V] Run locally against `next dev` (see §5): request → no-password sign-in refused → set-password mail → password set → link does not sign in → sign-in succeeds — all pass; then Better Auth's client follows the `callbackURL` and the page becomes **"Your email address is verified."** instead of the account page, so the test fails on both viewports (2/2). The callback predates the PR, but under mailbox-first `/verify-email` is a denied route and the page is meaningless. Not a security issue; a defect in a PR deliverable on the first-admin activation path.

**M3 — Timing acceptance at saturation (D16) not demonstrated for the final code.** See §6.

### Low
- **L1 G2 guard scope** (`tests/unit/server-api-allowlist.test.ts`): does not flag `getAuth().handler(...)` outside the `/api/auth` route (a server action calling the handler directly would skip the gate), nor aliasing such as `const a = getAuth(); const { api } = a`. Today the only `.handler(` caller is the gated route [V].
- **L2 Env guard** (`src/server/env.ts` `productionGuardProblems`): runs on the first `serverEnv()` call, not at process start, so a bad value fails every request rather than the boot; loopback check misses forms like `0.0.0.0`, `::ffff:127.0.0.1`, `localhost.`. Fail-closed either way.
- **L3 SMTP retry** (`src/server/email/send.ts`): `ETIMEDOUT/ESOCKET/ECONNRESET/EPIPE` can occur after the server accepted the message → possible duplicate mail. Total retry span (35 s) exceeds the 10 s drain.
- **L4 Account-request window** (`src/server/auth/request-account.ts`): a mail failure after retries releases the mail slot but not the `acct-req` slot (delivery runs in the background); after three failed attempts during an outage the person waits up to 15 min. Matches the addendum (release only when `provision()` throws).
- **L5 Sibling-link race** (`auth.ts` `onPasswordReset`): two different live links used at the same instant can both succeed (last password wins); sequential use is correctly voided [V test R1].
- **L6 G1 under production cookie names**: G1 tests run only in the test config; no production-config test covers the `__Secure-` prefixed challenge/session names.
- **L7 UI**: a malformed address on the account-request form gets 400 but the page still shows "Check your email".

### Verified correct [V, code + tests]
Mailbox-first (`disableSignUp: true`, verification mail off, `/api/account-request` replies 202 before reading the address; unlisted = no query/row/mail) · 3/15 min `LIMITS.accountRequestPerAddress` + test `toBe(3)` · 3 h reset in both `THROTTLES` · `rateLimit: { enabled: false }` and test that Better Auth's `rate_limit` table is never written · no IP in any key (A rewrites + production suite) · 9 routed endpoints, 29 denied, exact-path matching, contract test · G1 (cookie required, session cookies stripped, 3 tests) · G2 allowlist matches addendum §3 · malformed-address 400 before lookup/reservation (13-body equivalence test) · identical fire-and-forget `auth.sign_in.fail` for known/unknown, capped 5/s · recognised-browser key version (fail-closed on invalid) · `recoveryCodeCount` returns count only · live reset tokens bypass the backstop, sibling links voided, set-password verifies the address and never signs in · reserve/release for mail and daily cap · explicit `rejectUnauthorized: true`, TLS ≥1.2.

## 4. File paths for findings
M1 `src/server/auth/auth.ts` (verification options); `tests/e2e/admin.spec.ts:36–45`; `.github/workflows/ci.yml` (admin then two-factor steps). M2 `src/app/[locale]/(account)/AuthForm.tsx` (sign-in `callbackURL`), `.../verify-email/page.tsx`, `tests/e2e/auth.spec.ts:76`. L1 `tests/unit/server-api-allowlist.test.ts`. L2 `src/server/env.ts:56–87`. L3 `src/server/email/send.ts:24–52`. L4 `src/server/auth/request-account.ts:66–79`. L5 `src/server/auth/auth.ts` `onPasswordReset`. L6 `tests/integration/r4-v61-gate.test.ts:132–167`. L7 `AuthForm.tsx` `requestAccount`.

## 5. Test evidence

| Suite | Author [A] | CI 11.8.9 [V] | Local 10.11 [V] |
|---|---|---|---|
| Unit | 248/248 | 248/248 | 248/248 |
| Integration (default) | 209/209 | 209/209 | 209/209 |
| Integration (production) | 6/6 | 6/6 | 6/6 |
| `npm run verify` / typecheck / lint | pass / clean / 0+0 | pass | pass |
| Admin browser | — | **failed** (1 fail, 4 not run) | 11/11 ×3 |
| Two-factor browser | — | **not run** | 8/8 |
| Sign-up/auth browser | not run | not in CI | `next dev`: 10 pass, **2 fail** (M2) |

- **Required new tests present** [V]: oracle equivalence (B), audit parity + cap, G1 ×3, G2 ×6, env guard + TLS + retry + drain (13 unit), provision release/retry/audit/503 (9).
- **Retained tests** [V]: all 6 v6 `r4-*` files kept with the same 37 cases; the only assertion change is `toBe(5) → toBe(3)` (approved §1). The "23 retained R4 tests" figure could not be reproduced by count [I: counted differently]. Production suite rewritten L4, 6 tests. Non-R4 test files keep their case counts; renamed cases match the addendum's A/C/D/S classes; no `.skip/.only/.todo` added.
- **Sign-up browser tests — can they run safely?** Yes, locally with fictional data, but **not as documented**: since Phase 6a, `next start` (production mode) enables accounts only with all `SMTP_*` set, while the local mail outbox is used only when SMTP is *not* configured, so the documented recipe either 404s or tries real SMTP. Running against `next dev` (outbox on, no SMTP, isolated DB) works and is what produced M2. **Remaining gap:** no CI job runs `auth.spec.ts`; the production-build path of sign-up is untested in a browser.

## 6. Timing (D16)

| Run | Floored median K/U | p90 K/U | In-process flood median K/U |
|---|---|---|---|
| Author [A] | 400.6 / 400.6 | 401.1 / 401.2 | 400.2 / 400.1 |
| CI 11.8.9 [V] | 400.4 / 400.5 | 400.8 / 400.9 | 399.4 / 399.5 |
| Local 1 [V] | 400.6 / 400.6 | 401.0 / 401.0 | 400.0 / 400.1 |
| Local 2 [V] | 400.5 / 400.6 | 401.0 / 401.0 | 399.9 / 399.8 |
| Local 3 [V] | 400.6 / 400.6 | 401.0 / 401.0 | 399.9 / 399.9 |

- **One-process criterion: met** in 5 independent runs (4 verified); differences ≤ 0.1 ms (≈0.03 %), far below 5 %. The sign of the difference flips between runs at the 0.1 ms resolution, i.e. noise.
- **The author reported one run, not three.**
- **Saturation criterion (spec summary D16: < 5 % and not positive in 3 of 3 runs, two-process flood): not demonstrated for `dc19f1f`.** The in-process "flood" is floor-paced (exactly 4,824 requests every run ≈ 60 req/s), not CPU saturation, and the two-process harness was not committed, so the earlier v6 saturation results cannot be reproduced on the final code.

## 7. The seven reported deviations

| # | Deviation | Assessment |
|---|---|---|
| 1 | G1 also strips session cookies | **Acceptable.** Stricter than the addendum; closes the forged-cookie-name path; tested (401 `INVALID_TWO_FACTOR_COOKIE`, enrollment unchanged, real challenge still works with an old session). |
| 2 | G2 lets the gate read `$context` | **Acceptable, record as approved.** The addendum's own G1 fix prescribes reading the name from `$context`; its G2 list omits the gate — an inconsistency in the addendum. Use is limited by test to `createAuthCookie`/`authCookies`, no adapter. |
| 3 | SMTP retry only on connection failures | **Conforms.** Addendum §2.3: no retry on 4xx/auth. Residual duplicate-mail risk (L3). |
| 4 | Drain depends on `NEXT_MANUAL_SIG_HANDLE` | **Acceptable for merge, but §2.4 is not delivered by default.** [V] Next's `start-server.js` installs its own SIGTERM/SIGINT `cleanup` → `process.exit` unless the variable is set, so without it the 10 s wait is effectively absent. The addendum allows best effort and a lost job is recoverable (§2 table). Production runs the standalone server under Hostinger's process manager, whose signal behaviour is unknown [I]. Needs an owner decision and a test before activation; do not set the variable blind. Documented in `docs/backend/data-and-auth.md`, not in the activation runbook. |
| 5 | Sign-up browser tests not run | **Not acceptable as-is.** Run here: the main mailbox-first test fails (M2); the documented recipe cannot work in production mode (§5). |
| 6 | Harness not committed | **Allowed** by addendum §5.3 ("if at all"), but it leaves D16 saturation unverifiable on the final code (§6). |
| 7 | Local MariaDB 10.11.14 | **Partly resolved.** CI on 11.8.9 passed unit, integration and production suites; on 11.8.9 the admin browser job hit an InnoDB deadlock and the two-factor browser suite never ran. |

## 8. Production safety [V unless marked]
- No migration files, Drizzle metadata, `scripts/db/*`, workflow, `package.json` or lockfile changed. Migration 0004 not present.
- No `.env*` committed (only `.env.example`, unchanged); no secrets; only fictional `@nltag.test`/`example.test` addresses; test secrets are obvious fixtures.
- `CLIENT_IP_SOURCE` mentioned only in docs/comments/tests; not set or changed.
- No SMTP host/credential change; transport adds explicit certificate verification.
- New D9 Tamil strings remain `draft-review`.
- PR is unmerged, so Hostinger auto-deploy has not built it. Hostinger configuration and the production database were **not accessed** — whether the first Church Admin exists cannot be verified here; the PR contains no code that registers one.
- **Merge = deploy** (auto-deploy from `main`, project report of 2 Nov). On the live site with accounts off, the merge changes: the env guard becomes active (`https` site URL) and would fail every request if any listed test/harness value were present; the drain listeners are installed (harmless without the variable). Auth stays 404.

## 9. Fixes required before merge
1. **Green CI on `dc19f1f` or its successor, including the two-factor browser step.** Re-run the failed job (owner action). If the deadlock recurs, stop the concurrent-lookup race — options for the owner to approve: `verification: { disableCleanup: true }` plus a bounded periodic purge (as done for `rate_limit_bucket`), or one retry on `ER_LOCK_DEADLOCK` for verification cleanup; at minimum make the two browser projects not submit TOTP in the same step.
2. **M2:** remove or change the sign-in `callbackURL` (`/${locale}/account`, or none, since the form already routes) so a password sign-in no longer lands on `/verify-email`; get `auth.spec.ts` passing, and either fix the documented run recipe or add a dev-mode browser job so the mailbox-first path has browser coverage.
3. **Owner check before clicking merge:** confirm the hPanel variable list contains none of the env-guard values (the PR's R4 environment checklist), because the merge deploys immediately.

## 10. Can be deferred (merge → before first Church Admin activation)
- D16 saturation runs: two-process harness, 3 runs, < 5 % and not positive, on the merged code (M3).
- Decide and test graceful shutdown on Hostinger (`NEXT_MANUAL_SIG_HANDLE`) and add it to the activation runbook.
- L1 (add `.handler(` and alias patterns to G2), L2, L3, L4, L5, L6 production-config G1 test, L7.
- Already listed as activation gates: D9 Tamil approval; production `__drizzle_migrations` contains `0003`.
- D18 durable outbox remains deferred.

---
*Access note:* to read CI status, this session attached the repository with GitHub credentials; only read calls were made (PR, check runs, job logs). Local scratch: `.env.local` with CI-only values in the throw-away clone (git-ignored), fictional seed data in a local database; no files in the repository were changed.
