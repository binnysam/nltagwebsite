# Data and authentication foundation (Phase 4b)

Status: built and tested locally on 2 Nov 2026. Not deployed. No production database exists.
Design source: Phase 4 architecture (approved with adjustments) and the Phase 4a infrastructure report.

## Stack
| Concern | Choice |
|---|---|
| Database | MariaDB 11.8 (Hostinger Business). App connects to `127.0.0.1:3306`, never `localhost`. |
| Data access | Drizzle ORM 0.45 + `mysql2`, pool of 5, session time zone UTC |
| Migrations | `drizzle-kit generate` → reviewed SQL in `drizzle/` → `npm run db:migrate`. Never `push`/`introspect`. |
| Auth | Better Auth 1.7 (self-hosted, tables in our database) |
| Email | `nodemailer` over Gmail SMTP with an App Password (not configured yet) |
| Validation | Zod (environment now; forms in 4c/4d) |

## Code map
```
src/server/                 server-only (import "server-only"); never reaches the browser
  env.ts                    lazy, validated environment (names only in errors)
  db/columns.ts             ascii_bin ids/tokens, datetime(3)
  db/schema/auth.ts         user, session, account, verification, rate_limit (Better Auth)
  db/schema/access.ts       staff_role, audit_log, rate_limit_bucket
  db/client.ts              pool + Drizzle
  auth/auth.ts              Better Auth configuration (getAuth())
  auth/session.ts           getCurrentUser, requireUser, requirePermission, AuthzError, mustEnrollTwoFactor
  auth/two-factor-policy.ts two-factor rules: required roles, session paths, code parsing, limits (pure)
  policy/permissions.ts     permission matrix (pure data), can(), session lengths
  services/roles.ts         bootstrapFirstAdmin, grantRole, revokeRole
  services/audit.ts         audit(), action names
  services/rate-limit.ts    consume() fixed-window counters; reserveAttempt()/releaseAttempt() progressive-delay throttle (sign-in)
  auth/recognised-browser.ts  signed recognised-browser token (sign-in protection; skips nothing)
  auth/verification-purge.ts  bounded primary-key purge of expired verification rows (M1 option B)
  email/templates.ts        bilingual verify/reset emails (Tamil first)
  email/transport.ts        smtp | dev outbox (.data/mail) | memory (tests)
  email/send.ts             per-address and 24-hour caps, background send
  security/hash.ts          HMAC of IPs and emails
  security/client-ip.ts     client IP behind the CDN (one resolver) + header-shape capture (docs/backend/client-ip.md)
src/proxy.ts                sets the internal x-nltag-client-ip header on every request (never from the client)
  security/log.ts           redacting JSON logger
src/app/api/auth/[...all]   Better Auth HTTP handler
src/app/[locale]/(account)  sign-in, sign-up, forgot/reset password, verify-email, account,
                            two-factor (sign-in code), account/two-factor (setup, recovery codes, turn off)
src/server/cms/             CMS rules, validation, services, public queries (Phase 4c, docs/backend/cms.md)
src/app/admin/              CMS admin (English-first, staff only, follows the accounts gate)
scripts/db/                 migrate, seed (fictional), create-first-admin
drizzle/                    versioned SQL migrations + meta
```

## Tables (migration 0000_identity_access_audit)
| Table | Purpose | Notes |
|---|---|---|
| `user` | account | email unique, case-insensitive (Unicode collation) |
| `session` | DB sessions | token `ascii_bin` unique; 7 days; staff ended after 12 h |
| `account` | password hash (scrypt) or Google link | OAuth tokens encrypted at rest |
| `verification` | reset tokens | identifiers stored hashed |
| `rate_limit` | Better Auth counters | per resolved client IP + path (`no-trusted-ip` = shared, see `client-ip.md`) |
| `staff_role` | `CHURCH_ADMIN` / `CONTENT_EDITOR` | unique (user, role) |
| `audit_log` | append-only trail | ids, action, outcome, HMAC'd IP; no names/emails/tokens |
| `rate_limit_bucket` | our counters | email per address, 24-hour mail cap, sign-in delay per account and per recognised browser (HMAC keys; `window_start = 0` rows are delay episodes) |

Database default and every table: `utf8mb4` / `utf8mb4_uca1400_ai_ci` (Tamil). Ids, tokens and hashes: `ascii_bin` (case-sensitive).

**Two-factor (Phase 6b, migration `0003_two_factor`):** `two_factor` (one row per user: encrypted authenticator secret, encrypted recovery codes, `verified`, failed-code counter, `locked_until`; cascades with the user) and `user.two_factor_enabled` (default off). Additive.

**Content tables (Phase 4c, migration `0001_cms_content`):** `content_item`, `content_translation`, `event_detail`, `sermon_detail`, `ministry_detail`, `testimony_detail`, `bible_translation`, `verse_detail`, `verse_text`, `verse_schedule`, `media_asset`. Details, workflow and the CMS authorization table: `docs/backend/cms.md`. Membership tables arrive with their own migration in 4d.

## Rules for every protected action
1. `const me = await requirePermission(await headers(), "<permission>")` first. 401 if signed out, 403 if not allowed (or 404 with `hideAs404` where existence must not leak). Denials are audited.
2. Roles come from `staff_role` on every request; nothing from cookies or the client.
3. Ids from the client are lookup keys only; re-check ownership against `me.userId`.
4. Write an `audit()` row for anything an admin would need to account for. Never put personal data in it.
5. New permissions are denied to everyone until added to `src/server/policy/permissions.ts` (and its test).
6. CMS writes go through `src/server/cms/service.ts`, which checks permissions itself and applies the workflow rules in `src/server/cms/rules.ts` (Phase 4c used the existing permissions; the matrix is unchanged).

## Permissions
| Permission | Visitor | Member | Content Editor | Prayer Team (Nov 2026) | Church Admin |
|---|---|---|---|---|---|
| content.read_published | ✓ | ✓ | ✓ | ✓ | ✓ |
| account.manage_own, membership.own | | ✓ | ✓ | ✓ | ✓ |
| staff.portal (admin shell) | | | ✓ | ✓ | ✓ |
| admin.access (CMS area), content.draft.edit, media.upload | | | ✓ | | ✓ |
| content.submit_for_review | | | ✓ | | |
| content.publish, gallery.publish | | | | | ✓ |
| prayer.read, prayer.manage | | | | ✓ | ✓ |
| prayer.delete, contact.read, contact.manage | | | | | ✓ |
| submission.read, submission.decide | | | ✓ | | ✓ |
| submission.contact (submitter contact details, delete) | | | | | ✓ |
| membership.read_any/decide/birthdays/reports/export | | | | | ✓ |
| staff.manage, audit.read | | | | | ✓ |

Prayer Team (owner requirement: prayer requests readable only by the Church Admin and specifically authorised prayer-team members) has no CMS access; `/admin` sends it to `/admin/prayer`. Two-factor is required for Prayer Team as for Church Admin. The role exists in the database from migration 0004; the staff page offers it only where `NLTAG_PUBLIC_FORMS=1`.

An unverified email removes every permission except reading published content and managing one's own account.
**Two-factor (Phase 6b):** the Church Admin role grants nothing until the person has a verified authenticator app (`TWO_FACTOR_REQUIRED_ROLES` in `two-factor-policy.ts`, applied in `permissionsFor`). Content Editors are not required to (owner decision; one-line change to require it).

## Limits
R4 (Nov 2026, v6.1): Better Auth's own limiter is **off** (`rateLimit: { enabled: false }`); IP-keyed limits are retired (they could only key on one shared bucket behind the CDN). Every limit is per address (keyed hash) or per process, enforced by the route gate (`src/server/security/auth-abuse-gate.ts`) — see "R4 auth abuse gate" below.

| What | Limit | Where |
|---|---|---|
| Sign-in | Progressive delay per address from any IP: 5 password checks at once, then 30 s, 1, 2, 4, 8 min, then one per 15 min; resets after **3 hours** without a wrong password (D2, 3 Nov 2026; was 1 hour). A recognised browser (30 days) has its own budget. Class ceilings K 90/15 min, 120/h and A 60/15 min, 200/h | gate + `services/rate-limit.ts` |
| Account request (`/api/account-request`) | 5 / s, burst 20, per process, address-free (decided before the address is read); **3 / 15 min per listed address** that reaches provisioning (v6.1 §1) | `auth/request-account.ts` |
| Password reset request | 5 / 15 min per address (every address alike); answered before any lookup, at most 32 queued jobs per process (then `503` for every address) | gate |
| Set-password / reset link | valid links always pass; unknown tokens 20 / s, burst 40, per process | gate |
| Account emails to one address | 3 / hour per kind (reserved, given back if delivery fails) | `email/send.ts` |
| All outgoing mail | 300 per rolling 24 h (`EMAIL_DAILY_CAP`) | `email/send.ts` |
| Two-factor code at sign-in | gate: only with the challenge cookie, 50 / s burst 100 per process; plugin: 5 tries per challenge, account locked 15 min after 5 wrong codes in a row | gate + plugin |
| Enable / disable / new recovery codes | server actions only (HTTP is 404); 5 / 15 min per account | `two-factor/actions.ts`, `auth.ts` |
| Sign-in failure audit rows | 5 / s per process; excess counted, one summary log line a minute | gate |

## Sign-in protection (PR #11 follow-up, Nov 2026)
Code: `reserveSignInAttempt` / `settleSignInAttempt` in `auth.ts`, `reserveAttempt` / `releaseAttempt` / `claimOncePerWindow` in `services/rate-limit.ts`, `auth/recognised-browser.ts`. Tests: `tests/integration/sign-in-protection.test.ts`. No migration (uses `rate_limit_bucket`).

**Reserve before the password check (H1).** Every `/sign-in/email` reserves one attempt for the address in the before hook, with a single conditional `UPDATE` under the row lock. Only if a row changed does Better Auth check the password. A burst of any size, from any number of IPs, gets at most 5 password checks (tested with 40 concurrent requests). The after hook keeps the reservation only for a wrong address or password (`401`); a correct password — including one that continues to the authenticator step — an unverified email or a malformed request gives it back.

**Progressive delay, never a hard lock (M1, L1).** `THROTTLES.signInAccount`: 5 checks at once, then each further check must wait 30 s, 1, 2, 4, 8 minutes, then 15 minutes, after the previous counted one. Refused requests do not push the next slot further away. The episode ends one hour after the last counted check (no fixed window, so no boundary to exploit). At most about 100 password checks per day per address from all IPs together. Refused requests get `429` / `TOO_MANY_ATTEMPTS` with `Retry-After`, identical for addresses with and without an account, and the password is not checked (a correct password is refused too — otherwise the response would confirm the password).

**Recognised browser (M1).** Approved by the owner on 3 Nov 2026 with a **30-day** maximum lifetime. After a complete sign-in (password, plus the authenticator code when two-factor is on) the browser gets a cookie: `__Secure-nltag_rb` in production, `nltag_rb` locally; **HttpOnly**, **Secure** in production (the `__Secure-` prefix requires it), **SameSite=Strict** (never sent on a request another site starts; it is only needed on this site's own sign-in calls), path `/api/auth`, `Max-Age` 30 days, up to 4 tokens (`recognisedBrowserCookieOptions` in `auth/recognised-browser.ts`). Each token is `1.<issued-at>.<random id>.<HMAC>`, the HMAC covering the keyed hash of the account's address (secret `BETTER_AUTH_SECRET`), so it is bound to that account: useless for any other address, and invalid if the address changes. The server also refuses any token issued more than 30 days ago, so a cookie kept past its `Max-Age` does not work. When that browser signs in to that address, its password checks use `THROTTLES.signInRecognisedBrowser` — the same schedule in a budget of its own — so someone who only knows the address cannot lock its owner out of a browser they have used. It is **not** a trusted device and bypasses nothing: password and authenticator code are still required every time (the "no trusted devices" decision stands).

**Revocation.** Tokens are stateless (no table), so **one browser or one token cannot be revoked individually**. They expire after 30 days; the only early revocation is rotating `BETTER_AUTH_SECRET`, which revokes **every** recognised-browser cookie at once — and also signs everyone out and resets the keyed rate-limit and audit hashes. A stolen token gives only a separate, equally slow guessing budget for that one address, for at most 30 days.

**Alerting.** The first refusal for an address in an hour writes one `auth.sign_in.throttled` audit row (`reason` = `account` or `recognised-browser`, no address) and a `security.sign_in_throttled` warning in the runtime log (12-character prefix of the keyed hash, the budget, the wait). Later refusals in that hour only increment a counter (no new rows; L3). For the shared budget, the account holder also gets one email per day (`email.signInThrottled.*`, no link), only if the account exists, sent in the background so responses and timing do not depend on it; it goes through the normal per-address and daily mail caps. Owner decision (3 Nov 2026): the alert stays **English only**; its two Tamil strings remain `draft-review` and are never sent until the owner approves them (`renderAlertEmail` adds Tamil only when both are `confirmed`).

**Remaining limit.** From a browser that has never completed a sign-in to that address, an attacker who keeps trying can take each 15-minute slot first. The account holder signs in from a browser they have used before; if none is available, the attack shows up in the audit log and the alert email.

**Purge race fix (4 Nov 2026, owner-approved).** `reserveAttempt` and `reserveWindow` write their row with `INSERT IGNORE` and count with a conditional `UPDATE`. The opportunistic purge (`purgeExpiredBucketsSometimes`, started by every gated auth request, at most once a minute per process) deletes rows whose `expires_at` has passed. When it ran between the two statements, the `UPDATE` found no row and a caller that should have passed got a spurious `429` with `retryAfterSeconds: 0` (found in the D16 two-process timing runs; known and unknown addresses alike, so no oracle, and it failed closed). Three ways in: first sight of an address (the row is written already expired), an address returning after its 3-hour reset (its expired row is still there), and `reserveWindow` at a window boundary. Fix: when the `UPDATE` changes nothing **and no row exists**, re-insert and retry, at most 3 rounds in all, then refuse as before. A refusal always leaves its row, so real refusals never retry; the purge only removes a row whose episode or window has ended, so a retry gives exactly the result the call would have had if the purge had run just before it: no limit is reset or widened. Happy-path statements are unchanged. Tests: `tests/integration/rate-limit-purge-race.test.ts` (the three races run deterministically by purging between the two statements; no-reset and fail-closed cases; 4-process bursts keep exactly `free` / `max` passes and one row per key).

**Purge without deadlocks (4 Nov 2026, owner-approved option 2).** The former purge, `DELETE … WHERE expires_at < ? LIMIT 5000`, read the `expires_at` index before the rows, while the reserve `UPDATE` locks the row (primary key) and then its `expires_at` index entry. These are opposite orders, so MariaDB cancelled one of them with `ER_LOCK_DEADLOCK` (1213); a cancelled reserve turned the sign-in into an error. `purgeExpiredBucketsSometimes` now (1) picks the keys of at most 500 expired rows with a plain `SELECT` (a consistent read, no locks), then (2) deletes exactly those keys in one short READ COMMITTED transaction, `DELETE t FROM rate_limit_bucket AS t FORCE INDEX (PRIMARY) WHERE (bucket_key, window_start) IN (…) AND expires_at < cutoff`. The hint is required because, for the same statement without it, the optimizer sometimes chooses the `expires_at` index depending on the data; MariaDB accepts index hints only on the multi-table `DELETE` form. The re-checked expiry keeps a row that a reserve refreshed between the two steps. Unchanged: cutoff `expires_at < now`, at most 5,000 rows per run (now 10 batches of 500), at most once a minute per process, fire-and-forget from the gate. Reserve and release statements, thresholds and expiry periods are unchanged; no migration. Tests: `tests/integration/rate-limit-pk-purge.test.ts`: an `EXPLAIN` guard (PRIMARY on the CI engine, MariaDB 11.8.9, empty table, 6,000 rows and after `ANALYZE`); what is deleted and kept; batches, bounds and schedule; and 4 processes with the purge running back to back for 8 s (zero 1213, every allowed reservation counted exactly once), plus a control run with the former statement (about 100 cancelled reserves per run locally; `RL_REQUIRE_CONTROL_DEADLOCK=1` asserts it). `purgeExpiredBuckets()` (nightly, not called anywhere) still uses the old range `DELETE`; use `purgeExpiredBucketsBatched()` before scheduling it.

## R4 auth abuse gate and mailbox-first registration (Nov 2026, v6.1)
Code: `src/server/security/auth-abuse-gate.ts`, `auth-routes.ts`, `process-limiter.ts`, `src/server/auth/request-account.ts`, `src/app/api/account-request/route.ts`, `src/server/lifecycle.ts`. Tests: `tests/integration/r4-*.test.ts`, `tests/unit/server-api-allowlist.test.ts`, `tests/unit/r4-v61-env-mail-lifecycle.test.ts`. No migration (D7; `rate_limit_bucket` and `audit_log` only). Owner decisions D1–D7 approved 3 Nov 2026. This supersedes the sign-in hooks and IP limits described above where they differ.

**Default deny (D4).** `/api/auth` forwards only nine method + exact-path routes (`AUTH_ROUTES`); everything else, including every other Better Auth endpoint (`DENIED_ENDPOINTS`, with the reason for each), is the gate's own 404 before Better Auth runs. A contract test fails when a Better Auth upgrade adds an unclassified endpoint.

**Mailbox-first registration (D1).** There is no password sign-up (`disableSignUp`, `/sign-up/email` denied). The create-account form sends only an address to `/api/account-request`, which answers `202` for every well-formed request before the address is looked at. Afterwards, only for addresses on `NLTAG_SIGNUP_ALLOWLIST`: a window of 3 per 15 minutes per address, a user row with **no credential** (unverified), and a set-password link (`email.setPassword.*`, D9) to `/ta|en/set-password`. Using the link sets the first password and verifies the address; it never signs in. All other links for that account are voided when one is used (R1). Existing accounts get a normal reset link instead. Unlisted addresses: no query, no row, no mail. Verification links (`/verify-email`) are not used any more.

**Malformed requests are no oracle (v6.1 B).** The gate validates the address with Better Auth's own rule (`z.email()`, exactly as given — no trimming) before the known-address lookup and before any reservation, for sign-in and reset requests. A malformed address gets the same `400` for every address and never spends a real address's budget.

**Same lookup before the reservation (D16 finding 3; owner-approved fix, PR #20, 4 Nov 2026).**
- **Why it matters:** a failed sign-in is held until 400 ms, or until its own time up to the rate-limit reservation plus 1.1 × the slowest recent password work, whichever is later. That first part is not padded, so it must cost the same for every address.
- **Rule:** `isKnown()` runs one indexed `SELECT` on `user` by email for **every** address first, and checks `NLTAG_SIGNUP_ALLOWLIST` only afterwards. The result is unchanged: an existing account or an allowlisted address counts as known.
- **Before the fix:** the allowlist check returned early, so under load every allowlisted address (no account, account requested but no password, or active account) answered one query faster than any other address. It separated staff addresses from all others, but did not show activation status.
  - Finding 3 harness (one process, +50 ms per database round trip): −51.5 to −52.9 ms on `0d77c75`; −0.9 to +0.7 ms with the fix, every 95 % interval including 0.
  - The saturated D16 sandbox runs measured −89 to −139 ms.
- **Cost:** one extra lookup per attempt for allowlisted addresses only: a `const` probe on `user_email_uq` that reads only the index.
- **Test:** `tests/integration/r4-allowlist-lookup.test.ts`, deterministic, no timing. With an explicit staff allowlist it records the statement order and requires exactly one user lookup before the first `rate_limit_bucket` statement, for five address shapes.

**Audit parity (v6.1 B).** Every wrong-address-or-password answer writes one `auth.sign_in.fail` row (no address; IP hash only when a trusted client IP exists — none while `CLIENT_IP_SOURCE` is unset), for known and unknown addresses alike, fire-and-forget and capped at 5 rows per second per process.

**Reset request: answered before the lookup (security-readiness review, 5 Nov 2026, item 4).**
- **The problem:** for an address with an account, Better Auth's forgot-password handler does about four more database round trips than for an unknown address. Those are the user lookup with accounts, the reset token `INSERT` and our `sendResetPassword` account lookup. The 250 ms floor hid this only while those round trips stayed fast.
  - Measured with the finding 3 latency proxy, an address with an account answered **+40 ms** later at 30 ms per round trip, and **+208 ms** later at 50 ms.
  - This held for an account off the allowlist, an allowlisted account and an allowlisted address with a requested account, alike.
- **Rule now:** `resetRequest()` decides the answer before anything about the address is looked up. The answer is always Better Auth's own `200` body (`RESET_REQUEST_ACCEPTED`, pinned against Better Auth by test).
  - Better Auth's work runs afterwards: lookup, token (single use, 1 hour, hashed identifier) and set-password or reset mail under the usual mail caps.
  - It runs as a tracked background job, like `/api/account-request`. The job is counted at once but starts only after the reply is decided, so no lookup for the address runs while the reply is being held.
  - **The job calls Better Auth's server API, `getAuth().api.requestPasswordReset({ body })`**, with exactly the body the gate validated (owner decision 5 Nov 2026, PR #24). Reset requests never reach Better Auth's HTTP handler.
    - It is G2-approved: `tests/unit/server-api-allowlist.test.ts` lists the gate as the second caller, with the rationale.
    - That test also pins a single call site in `runResetJob()`, reached only from `resetRequest()` after every gate check and once the reply is decided.
- **The answer's floor:** the 250 ms floor, or the shared sign-in estimator if that is higher (the slowest of the last 32 password checks × 1.1), the same for every address.
  - The estimator keeps a slow sample until 32 newer ones replace it, so after one slow sign-in every reset answer can take longer for a while, for every address alike. This is pre-existing and unchanged.
- **The form (`AuthForm.tsx`):** every answer that means a request was accepted shows the neutral "if an account exists" message.
  - `429` shows `auth.error.rateLimited` and `503` shows `auth.error.generic` ("Something went wrong. Please try again."): both mean nothing was queued, and both are the same for every address.
  - Tests: `tests/unit/auth-form.test.tsx`.
- **What the answer can still depend on:** only address-independent things:
  - the request shape (`400`);
  - the origin and redirect target (`403`);
  - shutdown, or more than **32** queued jobs in the process: `503 TRY_AGAIN` with `Retry-After: 30`, decided before the per-address window, so it spends no one's budget;
  - the per-address window, 5 per 15 minutes for every address alike (`429`).

  The 250 ms floor is unchanged.
- **Logs:**
  - A failing job is logged once, redacted, as `auth.reset_request.failed`. The server API throws, so nothing else prints it: a test checks that no console line of any source carries the address.
  - Better Auth's own log lines go through the redacting server logger (`logger.log` in `auth.ts`, level `warn` as before), so a failed query's parameters are masked (`[email]`).
  - **Still open, other endpoints (pre-existing):** for requests that do go through Better Auth's HTTP handler (sign-in, set-password and reset with a token, two-factor, session), its router (`better-call`) prints a non-API error raw with `console.error("# SERVER_ERROR: ", error)`, outside any logger option. A database failure there can write an address to the server log.
    - The owner decided against redacting `console.error` or `console.warn` for the whole process.
    - Closing it needs a narrow fix per path, or a change in Better Auth.
- **Shutdown:** queued jobs are part of the 10 s drain (`registerDrainWaiter("reset-requests")`); a lost job leaves a recoverable state (the person asks again).
- **Tests:** `tests/integration/r4-reset-request.test.ts`, with the shapes U, K, L0, L1 and L2 created through the real routes:
  - identical status, body and headers, and only real accounts get mail;
  - statement order: before the answer only `rate_limit_bucket` statements run, and they are the same for every shape;
  - timing at 0, 20, 30 and 50 ms of simulated delay per statement;
  - the link still works once and lasts an hour;
  - the 5 per 15 minutes window gives identical sequences for every shape;
  - origin, redirect and malformed checks;
  - `503` while draining and when the queue is full;
  - the floor;
  - logs;
  - **no path around the gate:** an accepted request makes one server-API call, after the hold and never through the HTTP handler; every refused request (400, 403, 429, 503) reaches neither; and the route sends reset requests only to the gate, with `404` when accounts are off.
- **Timing harness:** `scripts/d16/finding-3/reset-run.sh` (latency proxy). Results before and after the fix: `docs/reports/reset-request-timing/README.md`.

**Two-factor routes (G1, D6).** `/two-factor/verify-totp` and `/verify-backup-code` are forwarded only when the request carries the plugin's challenge cookie, and the gate strips session cookies from them, so Better Auth can only run its sign-in challenge there. Enabling, confirming, disabling and new recovery codes exist only as the account page's server actions (`2fa-manage` limit). `tests/unit/server-api-allowlist.test.ts` (G2) fails on any server-side Better Auth API call outside the approved list. The two-factor page shows only the number of recovery codes left (`auth/recovery-codes.ts`); decrypted codes never reach it.

**Recognised-browser revocation (D5).** `NLTAG_RECOGNISED_BROWSER_KEY_VERSION` (positive integer, default 1) is part of the cookie's key. **Raise it** (never lower it) and restart to revoke every recognised browser; sessions, authenticator secrets and recovery codes are untouched. An invalid value accepts no recognised browser and never breaks sign-in.

**Reliability without a job table (v6.1 §2).** The account request replies first and provisions in the background. A failed provision gives its window slot back. Account email: the per-address slot is reserved, given back if delivery fails; a connection-level SMTP failure (no reply from the server) is retried 3 times at 0 s, 5 s and 30 s under the one slot; a server reply (any 4xx/5xx) or an authentication error is never retried. Audit: `auth.account_request.provisioned` and `auth.account_request.link_issued` (user id only). On SIGTERM/SIGINT the process stops taking account requests (`503`, the same for every address) and waits up to 10 s for queued requests and emails. This is best effort: Next.js also exits on these signals, so the wait is only guaranteed with `NEXT_MANUAL_SIG_HANDLE` set (a separate deployment decision); a lost job leaves a recoverable state and the request page tells people to request again after 10 minutes. A durable outbox with a cron sweeper is deferred (D18; would need a migration).

**Production environment guard (v6.1 §5).** When `NODE_ENV=production` and `BETTER_AUTH_URL` is a non-loopback https URL, startup fails (variable names only, never values) if `NODE_TLS_REJECT_UNAUTHORIZED=0`, `BETTER_AUTH_SECRET` contains `test-only`/`harness-only`, `DATABASE_URL` contains `nltag-local-dev-only`/`ci-only`, `SMTP_HOST` is loopback, or `SMTP_USER`/`SMTP_PASS` is `harness`. The database host is not checked (production uses 127.0.0.1). The SMTP transport sets `tls.rejectUnauthorized: true` explicitly.

`AUTH_RATE_LIMIT` is still read by the accounts gate (must be `on` in production) and refused as `off` in production, but no longer switches a limiter: the vitest configs' `AUTH_RATE_LIMIT: "on"` is inert.

### Verification cleanup (M1 option B, owner decision 4 Nov 2026)
Better Auth 1.7.15 normally runs `DELETE FROM verification WHERE expires_at < ?` (a range delete on `verification_expires_idx`) inside every `findVerificationValue()` call. On MariaDB 11.8.9 that range delete and the two-factor consume transaction (`SELECT … FOR UPDATE` by identifier, then delete by id) lock rows in opposite orders and can deadlock (`ER_LOCK_DEADLOCK`, 1213; seen in CI on `dc19f1f`). Since 4 Nov 2026:
- `auth.ts` sets `verification: { storeIdentifier: "hashed", disableCleanup: true }` (a documented Better Auth option). No request runs the range delete any more.
- Expiry is still enforced by every consumer: `GET`/`POST /reset-password` compare `expiresAt` (`INVALID_TOKEN`); `consumeVerificationValue` returns nothing for an expired row (two-factor → `INVALID_TWO_FACTOR_COOKIE`); the gate's `liveResetToken` checks `expires_at > NOW(3)`. Tested with the cleanup off (`tests/integration/m1-verification-cleanup.test.ts`).
- `src/server/auth/verification-purge.ts` removes expired rows instead: a non-locking `SELECT id … WHERE expires_at < cutoff ORDER BY expires_at LIMIT 200`, then `DELETE … WHERE id IN (…) AND expires_at < cutoff` under READ COMMITTED. `cutoff` is one hour before now, so a live row (or one expired under an hour ago) is never a candidate, and the delete re-checks the expiry. The gate starts it fire-and-forget (`purgeExpiredVerificationsSometimes()`), at most once every 10 minutes per process and one at a time; no request waits for it. A failure is logged as `auth.verification_purge_failed` (driver error code and errno only) and retried at the next interval. If it never ran, the table only grows by a few rows per sign-in or reset.
- Concurrency evidence: `tests/integration/m1-verification-concurrency.test.ts` runs 1,000 parallel two-factor-shaped flows (lookup, consume, re-arm, consume, plus a just-expired row) with the purge looping alongside: zero deadlocks, every live row consumed exactly once. A control instance with Better Auth's cleanup on, same workload, reproduces 1213 on MariaDB 11.8.9 (count logged; `M1_REQUIRE_CONTROL_DEADLOCK=1` asserts it). `M1_ITERATIONS` raises the count.
- No migration: `verification_expires_idx` and the primary key exist since `0000`.
- Not changed: `onPasswordReset` still deletes sibling links with `DELETE FROM verification WHERE value = ?` (unindexed; rare, password set/reset only; review note for later).

## Production migrations on Hostinger
There is no SSH step in the deployment, so Hostinger builds use `npm run build:hostinger` (`scripts/hostinger-build.mjs`). It runs `next build`, and only when `NLTAG_APPROVED_PRODUCTION_MIGRATION=1` is set in the Hostinger environment it first applies the reviewed `drizzle/*.sql` to `DATABASE_URL` (127.0.0.1). Set that variable for one owner-approved build, then remove it. Migrations already applied are skipped (drizzle journal). The same script runs the one-time first-admin bootstrap (`NLTAG_BOOTSTRAP_ADMIN_EMAIL`, below); the two are refused in one build.

## Accounts gate (owner decision, 2 Nov 2026)
All account pages (`/ta|en/sign-in`, `sign-up`, `forgot-password`, `reset-password`, `verify-email`, `account`) and `/api/auth/*` return **404** until email delivery works. Code: `src/server/accounts-gate.ts`, used by `src/app/[locale]/(account)/layout.tsx` and `src/app/api/auth/[...all]/route.ts`. Read per request (no rebuild baked in). Nothing on the site links to these pages.

- Off by default everywhere. On only when `NLTAG_ACCOUNTS_ENABLED=1` (exact value).
- Staging (`NLTAG_DEPLOYMENT=staging`, Nov 2026): SMTP is not required because staging mail is captured and never delivered; `AUTH_RATE_LIMIT=on` is still required. See `docs/operations/staging.md`.
- In production the flag is ignored unless `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` and `SMTP_FROM` are all set **and** `AUTH_RATE_LIMIT` is explicitly `on` (Phase 6a). The limiter itself defaults to on and production refuses `off`; the gate additionally refuses to rely on the default.
- Tests: `tests/unit/accounts-gate.test.ts`, `tests/e2e/accounts-gate.spec.ts` (every page in both languages, the auth API, no links from the homepage).

### Staff-only sign-up allowlist (Phase 6a)
`NLTAG_SIGNUP_ALLOWLIST` (comma-separated, case-insensitive) lists the addresses that may create an account; membership (Phase 4d) is not authorised, so only staff need accounts. Code: `src/server/auth/signup-allowlist.ts`, enforced by the account request (`auth/request-account.ts`, R4 mailbox-first) and still in the `user.create.before` database hook in `auth.ts`, so it covers every way a user row can be created (and Google, if ever configured).
- An unlisted address gets the same `202` as a listed one (decided before the address is read), no row and no email. The form shows the usual "check your email".
- Fail closed: in production an unset/blank list means **nobody** can sign up, and a list with any entry that is not an email address refuses everyone (warning logged once, by variable name only). Outside production an empty list leaves sign-up open for development and tests.
- Sign-in, verification and password reset for existing accounts are not affected. Removing someone from the list does not delete or disable their account; roles are managed in `/admin`.

### First Church Admin (Phase 6a)
`NLTAG_BOOTSTRAP_ADMIN_EMAIL`, set for one Hostinger build, makes the build run `npm run admin:bootstrap:env` after `next build` (`src/server/services/env-bootstrap.ts`). It grants nothing unless: one valid address; the accounts gate is open; the address is on `NLTAG_SIGNUP_ALLOWLIST`; the account exists and is verified; and no Church Admin exists (row lock). It writes the required `role.bootstrap` audit row, prints one line (`granted` / `not done: <reason>`, never the address or id) and never fails the deploy. Locally, `npm run admin:bootstrap -- <email>` does the same grant directly.

### Enabling accounts (owner-approved activation window)
Step-by-step runbook: `docs/operations/admin-activation.md`. SMTP delivery was tested on 2 Nov 2026 (Stage A, since removed).

## Two-factor (Phase 6b)
**Owner decisions (2 Nov 2026):** Church Admin — two-factor mandatory; Content Editor — optional; Google sign-in unconfigured; no trusted devices; single-use recovery codes, regenerating voids all old ones; disabling needs password and a second factor; phone and recovery codes both lost → owner-approved database reset (runbook § 11 D) with its own audit row, never an automatic bypass.

Better Auth's two-factor plugin (`better-auth/plugins/two-factor`) with authenticator apps (TOTP: 6 digits, 30 s) and 10 single-use recovery codes. Configured in `auth.ts`; rules in `two-factor-policy.ts`; screens in `src/app/[locale]/(account)/two-factor` (sign-in code) and `…/account/two-factor` (setup and management, server actions in `actions.ts`); owner runbook `docs/operations/admin-activation.md`.

| Rule | How |
|---|---|
| Enrollment needs the password and is off until the first code is confirmed | plugin `skipVerificationOnEnable: false`, `allowPasswordless: false` |
| Secret and recovery codes stored encrypted (BETTER_AUTH_SECRET) | plugin; recovery codes `storeBackupCodes: "encrypted"`; a used code is removed with a compare-and-set |
| Secret shown once only | `/two-factor/get-totp-uri` refused (404) in the before hook |
| Authenticator apps only | `/two-factor/send-otp`, `/verify-otp` refused; `enable` with `method` other than `totp` refused |
| Correct password alone gives no session | plugin replaces the session with a 5-minute signed HttpOnly challenge cookie |
| No "remember this device" | `trustDevice: true` refused (400) |
| Turning off and new recovery codes need password **and** a current code (app or recovery code) | before hook `requireCurrentSecondFactor` for `/two-factor/disable` and `/generate-backup-codes` |
| Enrolled accounts get sessions only through the challenge | `session.create.before` allows only the paths in `SESSION_PATHS_WITH_SECOND_FACTOR`; e.g. the automatic sign-in after an email link is refused and audited (`auth.2fa.bypass_blocked`) |
| Turning it on ends every other session | `user.update.after` on `/two-factor/verify-totp` |
| Church Admin must have it | `permissionsFor`; admin pages redirect to setup (`auth.2fa.required` audited); bootstrap refuses `NO_TWO_FACTOR` |
| QR code never leaves the browser | drawn locally as SVG with `uqr` (MIT, no dependencies) |
| Audit | `auth.2fa.enroll_start`, `.enable`, `.disable`, `.verify_fail`, `.recovery_code.use`, `.recovery_codes.regenerate`, `.manage_fail`, `.bypass_blocked`, `.required`, and `auth.2fa.reset_by_owner` written by the runbook § 11 D SQL itself; sign-in rows carry `reason=two-factor/verify-totp`. Never codes or secrets. |

Known limits: a code stays valid for its 30-second step and one step either side (plugin default), so a code seen over someone's shoulder could be reused within about a minute; `BETTER_AUTH_SECRET` must never change once anyone has enrolled; there is no in-app reset when phone and recovery codes are both lost (runbook § 11 D, by owner decision).

Tests: `tests/unit/two-factor.test.tsx`, `tests/integration/two-factor.test.ts` and `two-factor-owner-reset.test.ts` (MariaDB; the latter runs the runbook § 11 D SQL exactly as written), `tests/e2e/two-factor.spec.ts` (Tamil and English; screenshots mask the QR code, setup key and recovery codes). The seeded Church Admin has a fictional test authenticator (`scripts/db/seed-constants.ts`).

## Security behaviour (all covered by tests)
- Same response for registered and unregistered addresses (account request, sign-in, reset, malformed input); emails are sent in the background and failed sign-ins are held to a common floor, so timing does not reveal accounts.
- Origin and CSRF checks forced on in every environment (Better Auth disables them under `NODE_ENV=test` by default).
- Cookies `nltag.*`, HttpOnly, SameSite=Lax, Secure in production. No cookie cache, so revoking a session or role takes effect immediately.
- Password reset revokes all sessions; set-password and reset tokens are single use, 1 hour, stored only as a sha256 identifier, and using one voids the account's other links (R1). Verification links are no longer sent.
- Google sign-in is off until `GOOGLE_CLIENT_ID/SECRET` are set; it cannot be linked to an unverified local account, and it never grants membership or roles.
- Production refuses to start sending mail without SMTP; the dev outbox works only in development, or in a local production build with `NLTAG_LOCAL_MAIL_OUTBOX=1` and a localhost URL.

## Commands
```
npm run db:migrate              apply drizzle/*.sql to DATABASE_URL (.env.local)
npm run db:seed                 fictional @nltag.test accounts (refuses production / non-local DB)
npm run db:seed:content         fictional, bracketed sample CMS content (same refusals)
npm run admin:bootstrap -- <email>   first Church Admin only (verified account, once)
npm run admin:bootstrap:env     same, from NLTAG_BOOTSTRAP_ADMIN_EMAIL (Hostinger build only)
npm run db:generate -- --name <change>   new migration from schema changes; review the SQL
npm run test:integration        MariaDB-backed tests (TEST_DATABASE_URL, *_test database)
```

## Local setup
1. MariaDB 11.8 (Docker `mariadb:11.8`, or a local install). Create `nltag_dev` and `nltag_test` with `CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci` and a user for both.
2. Copy `.env.example` to `.env.local`; set `DATABASE_URL` and a random `BETTER_AUTH_SECRET` (`openssl rand -base64 48`).
3. `npm run db:migrate && npm run db:seed`, then `npm run dev`. Emails appear in `.data/mail/`.

## Open items
- Two-factor: built in Phase 6b (above); migration `0003_two_factor` not yet applied to production.
- Better Auth `verification` deadlock (PR #12, M1): **fixed by option B** (owner decision 4 Nov 2026), see "Verification cleanup (M1 option B)" above. The one-worker Playwright setting for `E2E_AUTH=1` runs stays as it is.
- `rate_limit_bucket` deadlocks (found 4 Nov 2026 with the purge race tests). The purge/reserve lock-order deadlock is **fixed by the primary-key purge** (option 2, "Purge without deadlocks" above). A rarer reserve/reserve deadlock remains, seen locally on MariaDB 10.11.14 3 times in about 165,000 calls, with the purge running back to back and 20 connections repeatedly retrying 40 addresses. When the purge has just deleted an address's row, two simultaneous requests for that address can deadlock: `INSERT IGNORE` takes a shared lock on the deleted record and then needs an exclusive one, while the other request's `UPDATE` is already waiting for an exclusive lock. One request fails with an error: closed, not a bypass, and counted nowhere. The old code had the same exposure. Retrying the cancelled statement (option 1) is deferred by the owner: reconsider only if MariaDB 11.8.9 CI still reproduces deadlocks.
- **D16 saturation timing (M3), open.** The two-process harness is in PR #16 (`scripts/d16/`). Its four runs tested `b4e37a8` and are superseded (`docs/reports/d16-timing/README.md`); none has been made on current `main`. The purge race they found is fixed (PR #17, #18). Two findings need owner decisions before new runs or activation:
  - **Finding 1, acceptance criterion (adopted 4 Nov 2026).** The former "median(known) − median(unknown) ≤ 1 ms" rule is decided by noise: the per-run SE of the median difference is about 29 ms, so a correct implementation passes 3 of 3 about 1 time in 8. The owner adopted option 2: a pre-registered pooled equivalence test (Hodges–Lehmann log shift; ±5 % for every comparison; one-sided upper bound +2.5 % and p90 ±5 % for allowlisted account vs unknown; 600 probes per class per run), in `docs/reports/d16-timing/acceptance-criterion.md` and `plan-2026-11.md`, implemented in `scripts/d16/stats.mjs` and `pooled.mjs`.
  - **Finding 3, allowlisted addresses answer faster under load. Security; open.**
    - `isKnown()` in the gate returns early for addresses on `NLTAG_SIGNUP_ALLOWLIST` and skips the user `SELECT` that every other address runs. That time falls in the unpadded part of the adaptive hold (`commonMs`).
    - At idle, everything is held to the 400 ms floor. Under load, every allowlisted address (no row, row without password, or full account) answers one query faster than any other address: −50 to −54 ms with +50 ms per round trip on current `main`, and −89 to −139 ms in the saturated sandbox runs.
    - This reveals allowlist membership (in production, every staff address), not activation status.
    - **Fixed, merged to `main` in PR #20 (`21c4b3a`, 4 Nov 2026)** (owner-approved Option A): the same `SELECT` for every address before the allowlist check (two lines; no change to limits, thresholds or statuses). See "Same lookup before the reservation" above. Confirmation under saturation is part of the final D16 runs.
    - Details: `docs/reports/d16-timing/finding-3-allowlist-timing.md`.
    - Note: `tests/integration/r4-timing.test.ts` runs without an allowlist (the "open" policy, where every address counts as allowlisted) and at idle, so it cannot see this class of difference.
- **Password-reset request timing: measured 5 Nov 2026, fix proposed (PR awaiting owner review).** An account answered later once database round trips took about 25 ms or more (+40 ms at 30 ms, +208 ms at 50 ms). The fix answers before the lookup and runs the work through Better Auth's server API (G2-approved): "Reset request: answered before the lookup" above. Still open for the other Better Auth endpoints: the raw `# SERVER_ERROR` print by Better Auth's router (same section). Also open: the sign-up form shows "sent" on the account-request route's `503` while shutting down; it was not changed in PR #24.
- **Intermittent raw timing test failure on CI.** `r4-timing.test.ts` "raw (no floor)" asserts p99 < 400 ms over 100 probes, i.e. the maximum. One transient slow request failed it on `2b1c7a0` (774.5 ms). Under investigation; the assertion is not changed without owner approval.
- Google OAuth client (D3): church-owned Google Cloud project; until then the button is hidden.
- Client IP behind Hostinger's CDN: resolver built (Nov 2026 security fix); `CLIENT_IP_SOURCE` stays unset until the header-shape capture confirms the hop count (`docs/backend/client-ip.md` §5). `TRUSTED_PROXIES` is no longer used.
- Tamil: the 38 Phase 4b account/email strings and 45 Phase 6b two-factor strings were approved by the owner on 2 Nov 2026. `auth.google` and `auth.or` stay `draft-review` (shown only once Google sign-in is configured).
