# NLTAG — Handoff: R4 v6.1 mailbox-first security work (PR #12)

Written 4 Nov 2026 (Kuwait); updated the same day after the M1 test-only fix (`ef95410`), and again after PR #12 was merged and deployed and the post-deployment review (`NLTAG-R4-POST-DEPLOYMENT-READINESS.md`, 4 Nov 2026) was answered. Read §0 first, then `CLAUDE.md`. §1–§4 below are the PR #12 history and are kept for reference; where they disagree with §0, §0 is current.
Source reports copied alongside: `NLTAG-PR12-REVIEW-FIXES-REPORT.md` (latest, 4 Nov) and
`NLTAG-PR12-INDEPENDENT-REVIEW.md` (the review it answers; §9.3 and §10 are referenced below).

## 0. Current status (post-deployment, 4 Nov 2026)

| Item | State |
|---|---|
| PR #12 | **Merged** into `main` on 4 Nov 2026 (`b4e37a8`); CI run 41795977099 green; deployed to Hostinger (owner-reported: public site works, account routes 404). |
| Accounts in production | **Off.** No Church Admin is registered, bootstrapped or activated. |
| Owner decisions, 4 Nov 2026 (post-deployment review) | **D9 (O1):** all 8 strings approved, English and Tamil; `auth.accountRequest.retry` uses "…please request the link again." / "…மீண்டும் இணைப்பைக் கோருங்கள்." Approval is needed before runbook § 3 (the strings are live from then). **Migration 0003 (O2):** production status **unknown** — the repository records it as not applied and nobody has checked production; it is established only from the § 1 export in the activation runbook; applying it needs separate explicit approval after a verified backup. **M1 (O3):** option B (`verification.disableCleanup: true` + bounded primary-key purge) before first-admin activation. **`NEXT_MANUAL_SIG_HANDLE` (O4):** stays unset. **D16 (O5):** isolated two-process procedure, 3 independent runs, valid `401` samples only, median and p90 differences < 5 %, median difference ≤ 1 ms. **Runbook (O6):** § 9 and § 10 and the § 8.2 items corrected. **L6, L1 (O7):** test-only PRs before activation. |
| Readiness work (one PR each, open for owner review, not merged) | **A** M1 option B (`claude/wonderful-einstein-wg3oqv`) · **B** this runbook/docs/D9 approval PR (`claude/post-deploy-runbook`) · **C** D16 timing test fix + two-process harness + run results (`claude/d16-timing-harness`) · **D** L6 production-cookie G1 test + L1 stricter allowlist test (`claude/l6-l1-auth-tests`). |
| Still deferred / later | L2 (env guard at boot, more loopback forms; behaviour change), L4 code fix (release the request slot on final mail failure; runbook note added now), L7 (form error mapping), alert-email English wording (O8), D18 durable outbox, migration 0004. L3 and L5 accepted. |
| Before the first Church Admin | PRs A–D reviewed, merged and deployed; production `0003` status established (runbook § 1) and, if absent, applied only with explicit approval (§ 2); D16 evidence accepted or waived by the owner; hPanel re-check (runbook § 0) immediately before § 3; a separate activation approval (G-E). |

Standing rules (§3 below) still apply, except rule 7: the branch for each piece of work is the one named in its task.

## 1. Where things stand (PR #12 history, before the merge)

| Item | Value |
|---|---|
| Repository | `binnysam/nltagwebsite` |
| Branch | `security/r4-v6.1-mailbox-first` (base `main` at `b48261d`, PR #11 merge) |
| PR | **#12** "R4 v6.1: default-deny auth gate, mailbox-first registration, v6.1 corrections" — open, not draft, **not merged**, `mergeable_state: clean` |
| Application code head | `84c9a32` — "R4 v6.1 review fix M2: sign-in no longer sends Better Auth to /verify-email". Nothing under `src/` has changed since. |
| Test head | `ef95410` — M1 option 1 (test-only): one Playwright worker when `E2E_AUTH=1`; two outdated test comments corrected. Changes `playwright.config.ts` and two comments only. Commits after it change docs only. |
| CI on `ef95410` | Run 41786598922: **verify ✅ · admin-browser ✅ (admin "12 tests using 1 worker": 11 passed, 1 skipped; two-factor 8/8, 1 worker) · public-browser ✅**. MariaDB `11.8.9-MariaDB-ubu2404` in every job. |
| CI on `84c9a32` | Run 41731111693: verify ✅ · admin-browser ✅ · public-browser ✅. |
| Earlier head | `dc19f1f`, run 41709104818: attempt 1 failed (M1 deadlock), attempt 2 failed (axe `document-title` flake). Both explained in §4. |
| Deployed? | No. Merging to `main` auto-deploys to Hostinger — merge **is** deploy. |

Commits on the branch (oldest first): `e929bc1` v6 candidate patch (reference) · `0a35848` 1: gate fixes B + G1 · `165d06b` 2: D9 set-password strings · `fdd6e85` 3: D2 3-hour reset · `f62667f` 4: class A rewrites · `2465721` 5: class C rewrites · `c7d6b4f` 6: class D rewrites · `dc19f1f` 7: G2, env guard + TLS, §2 reliability, 3/15 limit · `84c9a32` M2 fix · `ed62a59` handoff docs · `ef95410` M1 option 1 (test-only) · then docs-only handoff updates.

## 2. What the security work is for

R4 hardens sign-in, sign-up and password reset before the **first Church Admin** is activated on the live site (accounts are still off in production: `/api/auth` and account pages return 404). The goal: no account-existence oracle, no IP-dependent limits (Hostinger CDN gives no trustworthy client IP while `CLIENT_IP_SOURCE` is unset), no ungated Better Auth endpoint, and no way to self-register with a password.

### Done on this branch (owner decisions D1–D7 approved 3 Nov 2026)
- **D4 default-deny auth gate** in front of Better Auth: `src/server/security/auth-abuse-gate.ts`, `auth-routes.ts`. 9 routed endpoints, 29 denied (404), exact-path matching, contract test that fails on unclassified endpoints.
- **D1 mailbox-first registration**: `disableSignUp: true`; `/api/account-request` replies 202 before reading the address; listed addresses get an unverified user with no credential and a set-password link; unlisted = no query, row or mail. Set-password link never signs in.
- **D2** sign-in throttle resets after 3 h. **D3** Better Auth limiter off (`rateLimit: { enabled: false }`), every limit per address, no IP in any key.
- **D5** recognised-browser revocation by raising `NLTAG_RECOGNISED_BROWSER_KEY_VERSION` (invalid value accepts none, never throws).
- **D6** two-factor management only through server actions; HTTP enable/disable/generate-backup-codes denied.
- **D7** no migration (0004 deferred).
- **v6.1 corrections**: B (malformed-address oracle fixed; identical audit for known/unknown, capped 5/s) · G1 (two-factor verify routes require the challenge cookie; session cookies stripped) · G2 (unit test allowlisting every server-side `getAuth().api` / `$context` call) · account-request limit **3 per 15 min** · §2 reliability (release slot on failure, SMTP connection-failure retry 0/5/30 s, 10 s drain, audit `provisioned`/`link_issued`) · §5 production env guard + explicit SMTP `rejectUnauthorized: true`.
- **M2** (review): password sign-in no longer passes `callbackURL: /verify-email` (`AuthForm.tsx`, one line). Causal check: reverted → mailbox-first browser test fails 2/2; fixed → 2/2.
- **M1 option 1** (owner choice, 4 Nov 2026; `ef95410`): test-only — `playwright.config.ts` sets `workers: 1` when `E2E_AUTH=1`, so the phone and desktop projects never sign in the seeded Church Admin at the same moment. No app, `ci.yml` or assertion change. Options 2/3 deferred (§4).
- D9 Tamil strings (8: `email.setPassword.*`, `auth.accountRequest.*`, `auth.setPassword.*`) were `draft-review` at merge; **approved by the owner on 4 Nov 2026** (§0).

Full behaviour: `docs/backend/data-and-auth.md` → "R4 auth abuse gate".

## 3. Standing rules (do not break without the owner's explicit approval in chat)

1. **No merge** of PR #12 (or anything) into `main`. Merge = Hostinger deploy.
2. **No deploy** of any kind.
3. **No database migration**, local scripts against production included. Migration 0004 stays deferred.
4. **Do not change**: Hostinger hPanel environment variables · the production database · `CLIENT_IP_SOURCE` (stays unset) · the Church Admin account (none is registered; do not register, bootstrap or modify one).
5. **Never weaken or delete tests.** No `.skip`/`.only`/`.todo`, no loosened assertions, no deleted cases. Rewrites must keep the same security property (classes A/C/D in the v6.1 addendum).
6. **Anything that needs owner approval: stop and ask.** That includes workflow (`ci.yml`) changes, dependency changes, security behaviour changes (e.g. M1 options 2/3), new Tamil strings, `NEXT_MANUAL_SIG_HANDLE`, and anything in `CLAUDE.md` → "Ask before…".
7. Push only to `security/r4-v6.1-mailbox-first`. Never push to `main`. No secrets, no real member data; test data is fictional (`@nltag.test`, `example.test`).

## 4. Open items (from the PR #12 fixes report)

**M1 — MariaDB 11.8.9 deadlock on `verification`. Test side fixed (option 1, `ef95410`); 4 Nov 2026: owner chose option 3 below ("option B" in the post-deployment review), implemented in readiness PR A.**
Seen once (`dc19f1f`, attempt 1; 1 of the last 25 admin-browser runs): `DELETE FROM verification WHERE expires_at < ?` → `ER_LOCK_DEADLOCK` (1213). Better Auth 1.7.15 `findVerificationValue` range-deletes expired rows on every lookup unless `verification.disableCleanup` is set; two-factor verify then calls `consumeVerificationValue` (transaction deleting by identifier). Two concurrent verifies take index locks in opposite orders. Triggered by test setup: two Playwright projects signed in the same seeded Church Admin and `freshStep()` aligned their TOTP submits to the same 30 s step. Library behaviour, not introduced by the PR.
1. **Done — test-only (owner choice 4 Nov 2026, `ef95410`):** `playwright.config.ts` → `workers: process.env.E2E_AUTH === "1" ? 1 : undefined`. All database-backed auth runs (admin, two-factor, auth) are serial: every phone-390 test, then every desktop-1280 test. Chosen over staggering the TOTP submits because Better Auth also touches `verification` in the password step (two-factor challenge), and one worker needs no timing logic. `ci.yml` unchanged (its `--workers=1` on the two-factor step is now redundant but harmless). Other suites keep Playwright's default. Passing `--workers=N` explicitly on an `E2E_AUTH=1` run would bring the race back.
2. **Deferred — retry once on `ER_LOCK_DEADLOCK`** around the verification cleanup/consume path (small app change). Owner decision **before the first Church Admin activation**.
3. **Deferred — `verification: { disableCleanup: true }` + bounded periodic purge** of expired rows (like `rate_limit_bucket`), removing the race at source. Owner decision **before the first Church Admin activation**.
**Production:** the application is unchanged, so the underlying Better Auth race remains a rare possibility on MariaDB 11.8.9: two verifications (two-factor or other `verification` lookups) at the same instant can make one request fail with a 500; the user retries. It is not a bypass and grants nothing. With one Church Admin at first, concurrent verifies are unlikely.

**`document-title` axe flake.** Content Editor page (desktop), seen on `dc19f1f` attempt 2 and once before on the Phase 6b branch (2 Nov). PR does not touch admin pages, layout or titles. Pre-existing and intermittent; no change made.

**`auth.spec.ts` has no CI job.** Its documented recipe (`scripts/serve-gallery.sh` + `next start`) cannot work: since Phase 6a production mode enables accounts only with SMTP fully set, while the mail outbox is used only without SMTP. It passes against `next dev` (12/12 locally). Proposal: a dev-mode browser job in CI — **needs owner approval** (workflow change).

**§9.3 (independent review) — owner hPanel check before merge.** Owner confirms the hPanel variable list contains none of the env-guard values (`NODE_TLS_REJECT_UNAUTHORIZED=0`; `BETTER_AUTH_SECRET` containing `test-only`/`harness-only`; `DATABASE_URL` containing `nltag-local-dev-only`/`ci-only`; loopback `SMTP_HOST`; `SMTP_USER`/`SMTP_PASS` = `harness`). With any of them present the merged code fails every request on the live site. Owner action — Claude must not read or change hPanel.

**§10 deferred items (merge → before first Church Admin activation):**
- D16 saturation timing: two-process harness, 3 runs, < 5 % and not positive, on merged code (M3). **4 Nov 2026:** criteria fixed by the owner (§0); harness and runs in readiness PR C.
- Graceful shutdown on Hostinger: `NEXT_MANUAL_SIG_HANDLE`. **4 Nov 2026: stays unset** (owner decision); recorded in the runbook § 0.
- L1 G2 guard misses `getAuth().handler(...)` outside `/api/auth` and aliasing · L2 env guard runs on first `serverEnv()` not boot; loopback check misses `0.0.0.0`, `::ffff:127.0.0.1`, `localhost.` · L3 SMTP retry may duplicate mail; 35 s retry span > 10 s drain · L4 failed mail does not release the `acct-req` slot · L5 two live links used at the same instant can both succeed · L6 no production-config G1 test (`__Secure-` cookie names) · L7 malformed address on the request form gets 400 but page shows "Check your email".
- M1 options 2/3 (above): **decided 4 Nov 2026 — option 3 / B** (readiness PR A).
- Activation gates already listed: D9 Tamil approval (**done 4 Nov 2026**); production `__drizzle_migrations` and `0003` (**still unknown**; runbook § 1/§ 2). D18 durable outbox stays deferred.

**Outdated test comments — done (`ef95410`).** `tests/e2e/admin.spec.ts:37` and `tests/e2e/two-factor.spec.ts:117` now say what the form does since M2: password sign-in goes to `/account`, or to `/two-factor` when the account has two-factor on; never `/verify-email`. Comments only; the assertion beside the two-factor one (`not.toHaveURL(/\/two-factor$/)`) is unchanged.

## 5. Running the tests

| Suite | Command | Database | Where it has evidence |
|---|---|---|---|
| Verify (token audit, Tamil check, lint, typecheck, unit 248, build) | `npm run verify` | none | CI + local |
| Integration, default (209) + production config (6) | `npm run test:integration` | MariaDB, `nltag_test` from `.env.local` `DATABASE_URL` | CI 11.8.9 + local 10.11.14 |
| Admin browser (11 + 1 skip, one worker) | `npm run db:migrate && npm run db:seed && npm run db:seed:content` then `E2E_AUTH=1 npx playwright test admin` | MariaDB `nltag_dev`; accounts on, SMTP set to a dead local port (see `ci.yml` admin-browser `.env.local`) | CI 11.8.9 + local |
| Two-factor browser (8) | `E2E_AUTH=1 npx playwright test two-factor --workers=1` (after the admin run, same env) | as above | CI 11.8.9 + local |
| Public browser (97 + 5 skip) | `npm run db:migrate && npm run db:seed && npm run db:seed:public` then `PUBLIC_E2E_SEEDED=1 npx playwright test public-site accounts-gate` | MariaDB; `NLTAG_ACCOUNTS_ENABLED=0` | CI only |
| Mailbox-first sign-up (`auth.spec.ts`, 12) | `next dev` on :3100 with outbox (no `SMTP_*`, `NLTAG_ACCOUNTS_ENABLED=1`, `AUTH_RATE_LIMIT=on`, isolated DB), then `E2E_AUTH=1 npx playwright test auth` | MariaDB, isolated | **Local only — not in CI** |
| Design system / hero | `scripts/serve-gallery.sh && npm run test:e2e` | none | local |

Playwright starts its own server (`next build` + `next start -p 3100`) unless one is already running (`reuseExistingServer`). Projects: `phone-390`, `desktop-1280`. With `E2E_AUTH=1` the config uses **one worker** (M1), so the projects run one after the other; do not override it with `--workers`.

**MariaDB 11.8.9 vs local.** Production (Hostinger) is MariaDB 11.8.9; CI pins `mariadb:11.8.9` and asserts the version. The cloud sandbox could not pull container images, so its local evidence is **MariaDB 10.11.14** — fine for logic, but locking behaviour differs (M1 only appeared on 11.8.9). Treat CI as the authority for anything involving concurrency, locks or the browser auth jobs. On a machine with Docker, use `mariadb:11.8.9` (DB setup: `docs/backend/data-and-auth.md` → local setup; collation `utf8mb4_uca1400_ai_ci`).

## 6. Key decisions and why

- **Mailbox-first, no password sign-up (D1):** proves mailbox control before any credential exists; removes the sign-up enumeration surface. Staff-only allowlist stays eligibility-only.
- **Per-address limits only; Better Auth limiter off (D3):** without a trusted client IP, Better Auth keys every request into one shared bucket per path (a single attacker locks out everyone). `CLIENT_IP_SOURCE` stays unset until a CDN capture is reviewed.
- **Default deny (D4):** v5 found the gate default-allow with 28 endpoints ungated (23 with no limit). Now only 9 named routes pass; new library endpoints fail closed and the contract test flags them.
- **Key-version revocation (D5)** instead of rotating `BETTER_AUTH_SECRET`: the secret encrypts TOTP secrets, so rotating it breaks every enrollment.
- **Server-action-only 2FA management (D6) + G1 + G2:** closes the HTTP enrollment lane in the plugin and stops future server code from becoming an unprotected route.
- **3 per 15 min account requests:** matches the 3/hour mail cap, so every issued link can be delivered.
- **No migration (D7):** §2 reliability done with existing tables; 0004 and the durable outbox (D18) deferred.
- **M2 fix by removing the callback, not redirecting to `/account`:** the form already routes to `/two-factor` or `/account`; less surface.
- **M1: test-only fix (option 1)**, owner choice 4 Nov 2026: removes the trigger in our own tests without touching app code. Options 2/3 stay owner decisions before activation.

## 7. Approaches tried and rejected

- **Implementing the v6 candidate patch unchanged** — v6.1 review found real defects in 3 of its 29 failing tests (one an account-existence oracle) and 2 caused by a missing template. Patch kept as reference commit `e929bc1` only.
- **Rotating `BETTER_AUTH_SECRET` to revoke recognised browsers** — breaks TOTP (R6). Replaced by key version.
- **IP-keyed limiting via Better Auth / `CLIENT_IP_SOURCE`** (PR #11 direction) — retired by D3; forged/absent IP gives one shared bucket.
- **Fixed 400 ms timing floor** — 1.1 s known/unknown gap under a 512-connection flood; replaced by the adaptive floor.
- **Default-allow gate** (v4/v5 candidate) — replaced by default deny.
- **Email cap with `consume()`** — 20 concurrent requests burned the hour with 0 mails (F11); replaced by `reserveWindow()` + release.
- **Durable outbox + hPanel cron sweeper** — needs migration 0004; deferred as D18. Do not reuse `verification` or `rate_limit_bucket` as a job store.
- **Account-request limit 5 / 15 min** — created tokens that could never be mailed; changed to 3.
- **For M1: disable cleanup / add purge / add retry without approval** — explicitly not done; deferred as options 2/3.
- **For M1 option 1: staggering the projects' TOTP submits** (phase windows in `freshStep()`) — more code, up to ~20 s waits per sign-in, and it would not cover the password step, which also uses `verification`. One worker chosen instead.
- **`auth.spec.ts` via `next start`** — cannot enable accounts and the outbox together; works only with `next dev`.
- **Two-process harness in the repo** — not committed (addendum §5.3 allowed omitting it); consequence: D16 saturation not reproducible on the final code.
