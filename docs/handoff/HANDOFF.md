# NLTAG — Handoff: R4 v6.1 mailbox-first security work (PR #12)

Written 4 Nov 2026 (Kuwait). Read this, then `CLAUDE.md`, before touching this branch.
Source reports copied alongside: `NLTAG-PR12-REVIEW-FIXES-REPORT.md` (latest, 4 Nov) and
`NLTAG-PR12-INDEPENDENT-REVIEW.md` (the review it answers; §9.3 and §10 are referenced below).

## 1. Where things stand

| Item | Value |
|---|---|
| Repository | `binnysam/nltagwebsite` |
| Branch | `security/r4-v6.1-mailbox-first` (base `main` at `b48261d`, PR #11 merge) |
| PR | **#12** "R4 v6.1: default-deny auth gate, mailbox-first registration, v6.1 corrections" — open, not draft, **not merged**, `mergeable_state: clean` |
| Code head | `84c9a32` — "R4 v6.1 review fix M2: sign-in no longer sends Better Auth to /verify-email". The commit that adds this handoff sits on top and changes docs only. |
| CI on `84c9a32` | Run 41731111693: **verify ✅ · admin-browser ✅ (incl. two-factor step) · public-browser ✅**. MariaDB `11.8.9-MariaDB-ubu2404` confirmed by the version step. |
| Previous head | `dc19f1f`, run 41709104818: attempt 1 failed (M1 deadlock), attempt 2 failed (axe `document-title` flake). Both explained in §4. |
| Deployed? | No. Merging to `main` auto-deploys to Hostinger — merge **is** deploy. |

Commits on the branch (oldest first): `e929bc1` v6 candidate patch (reference) · `0a35848` 1: gate fixes B + G1 · `165d06b` 2: D9 set-password strings · `fdd6e85` 3: D2 3-hour reset · `f62667f` 4: class A rewrites · `2465721` 5: class C rewrites · `c7d6b4f` 6: class D rewrites · `dc19f1f` 7: G2, env guard + TLS, §2 reliability, 3/15 limit · `84c9a32` M2 fix.

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
- D9 Tamil strings (8: `email.setPassword.*`, `auth.accountRequest.*`, `auth.setPassword.*`) are in, still `draft-review`.

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

**M1 — MariaDB 11.8.9 deadlock on `verification` (latent, not reproduced on `84c9a32`).**
Seen once (`dc19f1f`, attempt 1; 1 of the last 25 admin-browser runs): `DELETE FROM verification WHERE expires_at < ?` → `ER_LOCK_DEADLOCK` (1213). Better Auth 1.7.15 `findVerificationValue` range-deletes expired rows on every lookup unless `verification.disableCleanup` is set; two-factor verify then calls `consumeVerificationValue` (transaction deleting by identifier). Two concurrent verifies take index locks in opposite orders. Triggered by test setup: two Playwright projects sign in the same seeded Church Admin and `freshStep()` aligns their TOTP submits to the same 30 s step. Library behaviour, not introduced by the PR. **No fix applied, by instruction.** Owner to choose:
1. **Test-only (recommended now, lowest risk):** stop the two browser projects submitting a TOTP for the same admin in the same instant (stagger desktop, or run admin with one worker). Needs approval (test/workflow change).
2. **Retry once on `ER_LOCK_DEADLOCK`** around the verification cleanup/consume path — small app change.
3. **`verification: { disableCleanup: true }` + bounded periodic purge** of expired rows (like `rate_limit_bucket`) — removes the race at source.
Production impact if left: a rare 500 when two verifications coincide; user retries; not a bypass. Option 2 or 3 before activation if wanted.

**`document-title` axe flake.** Content Editor page (desktop), seen on `dc19f1f` attempt 2 and once before on the Phase 6b branch (2 Nov). PR does not touch admin pages, layout or titles. Pre-existing and intermittent; no change made.

**`auth.spec.ts` has no CI job.** Its documented recipe (`scripts/serve-gallery.sh` + `next start`) cannot work: since Phase 6a production mode enables accounts only with SMTP fully set, while the mail outbox is used only without SMTP. It passes against `next dev` (12/12 locally). Proposal: a dev-mode browser job in CI — **needs owner approval** (workflow change).

**§9.3 (independent review) — owner hPanel check before merge.** Owner confirms the hPanel variable list contains none of the env-guard values (`NODE_TLS_REJECT_UNAUTHORIZED=0`; `BETTER_AUTH_SECRET` containing `test-only`/`harness-only`; `DATABASE_URL` containing `nltag-local-dev-only`/`ci-only`; loopback `SMTP_HOST`; `SMTP_USER`/`SMTP_PASS` = `harness`). With any of them present the merged code fails every request on the live site. Owner action — Claude must not read or change hPanel.

**§10 deferred items (merge → before first Church Admin activation):**
- D16 saturation timing: two-process harness, 3 runs, < 5 % and not positive, on merged code (M3; harness not committed, so not reproducible yet).
- Graceful shutdown on Hostinger: decide and test `NEXT_MANUAL_SIG_HANDLE`; add to the activation runbook. Do not set it blind.
- L1 G2 guard misses `getAuth().handler(...)` outside `/api/auth` and aliasing · L2 env guard runs on first `serverEnv()` not boot; loopback check misses `0.0.0.0`, `::ffff:127.0.0.1`, `localhost.` · L3 SMTP retry may duplicate mail; 35 s retry span > 10 s drain · L4 failed mail does not release the `acct-req` slot · L5 two live links used at the same instant can both succeed · L6 no production-config G1 test (`__Secure-` cookie names) · L7 malformed address on the request form gets 400 but page shows "Check your email".
- Activation gates already listed: D9 Tamil approval; confirm production `__drizzle_migrations` contains `0003`. D18 durable outbox stays deferred.

**Outdated test comments.** `tests/e2e/admin.spec.ts:37` and `tests/e2e/two-factor.spec.ts:117` still say sign-in "may land on … verify-email". Harmless after M2; tighten later (comment-only, but the assertion beside it must not be weakened).

## 5. Running the tests

| Suite | Command | Database | Where it has evidence |
|---|---|---|---|
| Verify (token audit, Tamil check, lint, typecheck, unit 248, build) | `npm run verify` | none | CI + local |
| Integration, default (209) + production config (6) | `npm run test:integration` | MariaDB, `nltag_test` from `.env.local` `DATABASE_URL` | CI 11.8.9 + local 10.11.14 |
| Admin browser (11 + 1 skip) | `npm run db:migrate && npm run db:seed && npm run db:seed:content` then `E2E_AUTH=1 npx playwright test admin` | MariaDB `nltag_dev`; accounts on, SMTP set to a dead local port (see `ci.yml` admin-browser `.env.local`) | CI 11.8.9 + local |
| Two-factor browser (8) | `E2E_AUTH=1 npx playwright test two-factor --workers=1` (after the admin run, same env) | as above | CI 11.8.9 + local |
| Public browser (97 + 5 skip) | `npm run db:migrate && npm run db:seed && npm run db:seed:public` then `PUBLIC_E2E_SEEDED=1 npx playwright test public-site accounts-gate` | MariaDB; `NLTAG_ACCOUNTS_ENABLED=0` | CI only |
| Mailbox-first sign-up (`auth.spec.ts`, 12) | `next dev` on :3100 with outbox (no `SMTP_*`, `NLTAG_ACCOUNTS_ENABLED=1`, `AUTH_RATE_LIMIT=on`, isolated DB), then `E2E_AUTH=1 npx playwright test auth` | MariaDB, isolated | **Local only — not in CI** |
| Design system / hero | `scripts/serve-gallery.sh && npm run test:e2e` | none | local |

Playwright starts its own server (`next build` + `next start -p 3100`) unless one is already running (`reuseExistingServer`). Projects: `phone-390`, `desktop-1280`.

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
- **M1: no app change** until the owner picks an option (instruction from the review round).

## 7. Approaches tried and rejected

- **Implementing the v6 candidate patch unchanged** — v6.1 review found real defects in 3 of its 29 failing tests (one an account-existence oracle) and 2 caused by a missing template. Patch kept as reference commit `e929bc1` only.
- **Rotating `BETTER_AUTH_SECRET` to revoke recognised browsers** — breaks TOTP (R6). Replaced by key version.
- **IP-keyed limiting via Better Auth / `CLIENT_IP_SOURCE`** (PR #11 direction) — retired by D3; forged/absent IP gives one shared bucket.
- **Fixed 400 ms timing floor** — 1.1 s known/unknown gap under a 512-connection flood; replaced by the adaptive floor.
- **Default-allow gate** (v4/v5 candidate) — replaced by default deny.
- **Email cap with `consume()`** — 20 concurrent requests burned the hour with 0 mails (F11); replaced by `reserveWindow()` + release.
- **Durable outbox + hPanel cron sweeper** — needs migration 0004; deferred as D18. Do not reuse `verification` or `rate_limit_bucket` as a job store.
- **Account-request limit 5 / 15 min** — created tokens that could never be mailed; changed to 3.
- **For M1: disable cleanup / add purge / add retry without approval** — explicitly not done; listed as options.
- **`auth.spec.ts` via `next start`** — cannot enable accounts and the outbox together; works only with `next dev`.
- **Two-process harness in the repo** — not committed (addendum §5.3 allowed omitting it); consequence: D16 saturation not reproducible on the final code.
