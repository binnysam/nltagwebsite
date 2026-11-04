# Owner runbook: open staff accounts and create the first Church Admin (with two-factor)

**Only with the owner present, in an approved activation window (gate G-E), after R4 (PR #12, `b4e37a8`) is deployed and the post-deployment readiness work (4 Nov 2026 review: M1 option B, runbook corrections, D16 evidence, L6/L1 tests) is merged and deployed.** Corrected on 4 Nov 2026 after the post-deployment review (`NLTAG-R4-POST-DEPLOYMENT-READINESS.md`, §8): § 0, § 1, § 2, § 3, § 5, § 7, § 9 and § 10.
Do the steps in order. Stop and roll back (§ 12) if any check fails. Nothing here touches the domain, DNS, email records, SMTP settings or Hostinger email.

**Owner decisions recorded (2 Nov 2026):** Church Admin — authenticator-app (TOTP) two-factor mandatory; Content Editor — optional for now; Google sign-in stays unconfigured; no trusted devices; recovery codes single-use, regenerating them voids all old codes; turning two-factor off needs password **and** a current code; phone and recovery codes both lost → the database reset in § 11 D, only with explicit owner approval and an audit row, never an automatic bypass. All 38 needed Phase 4b account/email and 45 Phase 6b two-factor Tamil strings are approved.

## Which steps need a Hostinger build, which do not

Hostinger masks variable values and applies them when the app (re)starts. Saving a variable restarts the app; that is enough for runtime settings. Two things run **only during a build** (`scripts/hostinger-build.mjs`): the database migration and the first-admin bootstrap. Those need *Save → trigger a rebuild/redeploy*.

| Step | What | How it takes effect |
|---|---|---|
| § 1 | Database backup | phpMyAdmin (no app change) |
| § 2 | Migration `0003_two_factor` — **only if § 1 shows it is not applied, and only with the owner's explicit approval for this activation** | **Build** with `NLTAG_APPROVED_PRODUCTION_MIGRATION=1`, then remove it and **build** again |
| § 3 | `AUTH_RATE_LIMIT`, `NLTAG_SIGNUP_ALLOWLIST`, `NLTAG_ACCOUNTS_ENABLED=1` | Save variables (app restart); no build |
| § 4–6 | Request the account, choose the first password from the emailed link, enroll authenticator, save recovery codes | In the app (browser + phone) |
| § 7 | Bootstrap with `NLTAG_BOOTSTRAP_ADMIN_EMAIL` | **Build** |
| § 8 | Remove `NLTAG_BOOTSTRAP_ADMIN_EMAIL` | Save, then **build** once more to confirm the log |
| § 9–10 | Admin, audit, 2FA, Content Editor and membership checks | In the app |
| § 12 | Close accounts (`NLTAG_ACCOUNTS_ENABLED=0`) | Save variable (app restart); no build |

If a saved variable does not seem to apply (for example the account pages still 404 after § 3), use *Restart* on the Node.js app, or a redeploy — never change other settings to force it.

**Restarts and pending emails.** Every saved variable, restart or build stops the running app (SIGTERM). The set-password email and the account request are sent in the background, and with `NEXT_MANUAL_SIG_HANDLE` unset (below) a restart can drop one that is still pending. Nothing is harmed (the person requests again), but **do not save variables, restart or trigger a build while a set-password email is being awaited** (§ 5), and do the build steps (§ 7, § 8) only after § 5 and § 6 are complete.

**Where variables live:** hPanel → Websites → **nltagkuwait.com** → the Node.js app → **Environment variables** (the list that already has `SMTP_*`, `DATABASE_URL`, `BETTER_AUTH_SECRET` and `NLTAG_ACCOUNTS_ENABLED`). Saving restarts the app. Type values only in hPanel — never in chat, email, GitHub or a file.

**Never change `BETTER_AUTH_SECRET` after anyone has enrolled.** It encrypts every authenticator secret and recovery code; a new value makes all of them unreadable and locks every Church Admin out of the admin (recovery: § 11 D for each person).

## What the code enforces (you cannot get these wrong by mistake)
- Account pages, the two-factor pages and `/api/auth` stay **404** in production unless `NLTAG_ACCOUNTS_ENABLED=1` **and** all `SMTP_*` are set **and** `AUTH_RATE_LIMIT=on`.
- Only addresses on `NLTAG_SIGNUP_ALLOWLIST` can create an account. Unset or mistyped list = nobody can. Everyone else sees the normal "check your email" message and nothing happens.
- **A Church Admin role does nothing until that person has a verified authenticator app.** Until then every admin page sends them to *Account → Two-factor sign-in*, and every admin action is refused.
- The bootstrap grants Church Admin at most once, only to a verified, allowlisted account **that has two-factor on**, writes an audit row, and prints only `granted` or `not done: <reason>`.
- After a correct password, an account with two-factor on gets **no session** until a 6-digit code (or a single-use recovery code) is entered. There is no "remember this device".
- Turning two-factor off or making new recovery codes needs the **password and a current code**.

## 0. Before you start
- [ ] The latest build log for `main` shows `No migration requested` and `No admin bootstrap requested (NLTAG_BOOTSTRAP_ADMIN_EMAIL not set).`
- [ ] `/ta/sign-in`, `/ta/two-factor` and `/admin` still show "Not Found".
- [ ] You know the first admin's address (a church staff mailbox that person can open).
- [ ] The first admin has a phone with an authenticator app installed (free: **Google Authenticator** or **Microsoft Authenticator**), and the phone's clock is set automatically.
- [ ] R4 (PR #12, `b4e37a8`) and the post-deployment readiness PRs are merged, and the Hostinger build for that `main` commit **completed** (its log: `No migration requested`, `No admin bootstrap requested`).
- [ ] Tamil: the 38 Phase 4b and 45 Phase 6b strings are approved (2 Nov 2026), and the 8 R4 D9 set-password strings, English and Tamil, were approved by the owner on 4 Nov 2026 (`docs/content/tamil-content-review.md`). **This must be true before § 3**: the D9 strings are live on `/ta/sign-up` as soon as accounts open. Still draft: `auth.google` and `auth.or` (shown only if Google sign-in is configured, and it is not) and the two `email.signInThrottled.*` alert strings (that email is sent in English only).
- [ ] You have a way to keep the first admin's recovery codes offline (printed and locked away, or in a password manager).
- [ ] **R4 (Nov 2026):** the R4 v6.1 PR is merged and deployed (gate G-C, done: `b4e37a8`); the D9 set-password strings, Tamil included, are approved (gate G-D, done 4 Nov 2026 — required before § 3); first Church Admin activation is approved (gate G-E).
- [ ] **R4 (migration 0003):** its production status is **not known from the repository** (the repository has recorded it as not applied; nobody has checked production since). It is established only from evidence in § 1 step 2 (the `__drizzle_migrations` rows in the verified export). If `0003` is there, skip § 2. If it is not, § 2 runs **only** with the owner's explicit approval given for this activation, after the verified § 1 backup. If the status cannot be read, stop here.
- [ ] **R4 (M1), decided 4 Nov 2026 — option B:** Better Auth's per-lookup cleanup is off (`verification.disableCleanup: true`) and a bounded primary-key purge removes rows expired over an hour ago, at most every 10 minutes, off the request path (`docs/backend/data-and-auth.md` → "Verification cleanup"). Its PR must be merged and deployed before § 3. No migration.
- [ ] **R4 (D16), decided 4 Nov 2026:** timing evidence from the isolated two-process harness (`scripts/d16/README.md`) — three independent runs, every timed probe a valid `401`, server CPU saturated, median and p90 differences under 5 %, median difference not positive beyond 1 ms (known − unknown ≤ 1 ms) — has been reviewed and accepted by the owner, or explicitly waived by the owner in writing.
- [ ] **`NEXT_MANUAL_SIG_HANDLE` stays unset (decided 4 Nov 2026).** Setting it removes Next.js's own shutdown (closing the listener and waiting for in-flight requests); the site's drain would then exit without closing the listener, which may conflict with Hostinger's restarts. Unset, a restart may drop a pending set-password email, which the person recovers by requesting again (see "Restarts and pending emails" above). Revisit only with local test evidence and Hostinger's observed stop signal and timeout.
- [ ] **R4 environment checklist** (hPanel → the site's environment variables; names and values checked by the owner, nothing copied out; re-check immediately before § 3): `CLIENT_IP_SOURCE` is **not set**; `TRUSTED_PROXIES` is **not set** (no longer used); `NEXT_MANUAL_SIG_HANDLE` is **not set**; `NLTAG_BOOTSTRAP_ADMIN_EMAIL` and `NLTAG_APPROVED_PRODUCTION_MIGRATION` are **not set** (they are added only in § 7 and § 2); none of these test/harness values is present — `NODE_TLS_REJECT_UNAUTHORIZED=0`; a `BETTER_AUTH_SECRET` containing `test-only` or `harness-only`; a `DATABASE_URL` containing `nltag-local-dev-only` or `ci-only`; `SMTP_HOST` of `127.0.0.1`/`localhost`; `SMTP_USER` or `SMTP_PASS` of `harness`. (The site also refuses to start with any of them.) `NLTAG_RECOGNISED_BROWSER_KEY_VERSION` is unset or a positive integer.

## 1. Fresh database backup
1. hPanel → Databases → phpMyAdmin → `u339364475_nltag` → **Export** → Custom → all tables, structure and data, SQL → download as `nltag-db-before-admin-YYYYMMDD-HHMM.sql`.
2. **Verify it:** the file is not empty, ends with the last table's data (no error text at the end), contains `CREATE TABLE` for `user`, `session`, `audit_log` and the CMS tables, and lists `__drizzle_migrations` with **3** rows (`0000`, `0001`, `0002`), **or 4 if `0003_two_factor` is already applied** (then a `two_factor` table also exists). Write down which: this is the production evidence for `0003` that § 0 asks for. (`__drizzle_migrations` stores hashes, not names: 3 rows = `0003` absent; 4 rows plus a `two_factor` table = applied.) In phpMyAdmin note the row count of `audit_log` and of one CMS table; the same `INSERT` rows must be in the file.
3. Also hPanel → Backups → Database backups → generate. Keep the export off the server and off shared computers.

## 2. Apply migration `0003_two_factor` (conditional, owner-approved)
**Skip this section if § 1 showed 4 rows and a `two_factor` table.** Otherwise do it only if the owner has explicitly approved applying `0003` in this activation window, after the § 1 backup was verified. Without that approval, stop: accounts cannot open without `0003`.

Adds the `two_factor` table and one column `user.two_factor_enabled` (default off). Additive only; the public site is unaffected before and after.
1. Add `NLTAG_APPROVED_PRODUCTION_MIGRATION` = `1`. Save.
2. hPanel → trigger a **rebuild/redeploy**. The build log must show `Owner-approved production migration requested for this build.` and finish successfully.
3. **Delete `NLTAG_APPROVED_PRODUCTION_MIGRATION`**, save, redeploy once more. That log must say `No migration requested`.
4. phpMyAdmin: `__drizzle_migrations` now has **4** rows; table `two_factor` exists and is empty.

## 3. Open accounts for the first admin only
Add these two variables and save (the app restarts):

| Name | Value |
|---|---|
| `AUTH_RATE_LIMIT` | `on` |
| `NLTAG_SIGNUP_ALLOWLIST` | the first admin's address (only that one for now) |

Then change `NLTAG_ACCOUNTS_ENABLED` from `0` to `1` and save.

Check (private window): `/ta/sign-in`, `/ta/sign-up` and `/ta/set-password` load; `/ta` still has `noindex` (page source contains `noindex, nofollow`); `/admin` sends you to the sign-in page.

**Expected in the runtime log:** `client_ip.resolution_off` (the IP resolver stays off by decision; its wording about a "shared rate-limit bucket" predates R4 and can be ignored — limits are per address).

**No SMTP smoke test exists any more** (Stage A was removed). The first real email is the set-password email in § 5; if it does not arrive within 10 minutes, read the runtime log for `email.send_retry` or `email.send_failed` (no addresses are logged) **before** requesting again. A refused login (for example a revoked Gmail App Password) shows there.

## 4. First admin requests the account (R4 mailbox-first)
(The D9 set-password strings were approved before § 3; see § 0.)
The admin opens `https://nltagkuwait.com/ta/sign-up` (or `/en/sign-up`), enters **only** the listed address and submits. The page always says to check email (the same for every address); there is no password on this form.

## 5. Choose the first password from the email
1. The set-password email ("Set your password", Tamil and English), sent through the church's Gmail SMTP, arrives in that mailbox. Open the link **within 1 hour**; it opens `/ta|en/set-password`. Choose a password of 10+ characters and save. Using the link proves the mailbox: the address is now verified. The link does **not** sign in, and any other set-password or reset link for the account stops working.
2. Sign in at `/ta/sign-in` with the address and the new password.
3. No email within 10 minutes: check spam; check the address matches the allowlist exactly; check the runtime log for `email.send_retry` / `email.send_failed` (§ 3); then request the link again. At most 3 requests per 15 minutes reach the mailbox and at most 3 emails are sent per hour. **After 3 requests with no email, wait 15 minutes before trying again** (L4: a request whose email failed still counts toward the 3 for its 15 minutes). Do not save variables, restart or rebuild while waiting for the email. Still nothing: roll back (§ 12) and report.

## 6. Authenticator enrollment and verification (the admin, on their phone and computer)
1. Signed in, open **Account** (`/ta/account`) → **Set up two-factor sign-in** (`/ta/account/two-factor`).
2. **Step 1:** enter the account password → *Continue*.
3. **Step 2:** in the authenticator app, *Add account* → *Scan QR code* and scan the code on screen. If scanning fails, choose *Enter a setup key* and type the **setup key** shown (time-based). The app now shows **NLTAG** with a 6-digit code that changes every 30 seconds.
4. **Step 3:** save the **10 recovery codes**: *Download the codes as a text file*, then print it or store it in a password manager, and delete the downloaded copy from shared computers. They are shown only once. Tick *I have saved my recovery codes in a safe place*.
5. Enter the current 6-digit code from the app → *Turn on two-factor sign-in*. The page says two-factor is now on and other devices were signed out.
6. **Check it works:** sign out, sign in again with the password — the site now asks for the 6-digit code — enter it and reach *Account*. Two-factor sign-in shows as on.

If the code is refused: check the phone clock is automatic, wait for a new code, try again. Five wrong codes in a row lock code entry for 15 minutes.

## 7. Grant the Church Admin role (one build)
Only after § 5 and § 6 are complete (a build restarts the app; nothing may be pending).
1. Add `NLTAG_BOOTSTRAP_ADMIN_EMAIL` = the same address. Save.
2. Trigger a **rebuild/redeploy** (the grant runs during the build, after `next build`).
3. In the build log, find exactly one of:
   - `Admin bootstrap: Church Admin role granted. …` → continue.
   - `Admin bootstrap not done: <reason>` → fix the reason, then rebuild again. The deploy itself still succeeds. Reasons you may see:
     - `the account has not set up its authenticator app yet …` → do § 6 first.
     - `the account's email is not verified yet.` → do § 5 (choose the first password from the emailed link).
     - `the address is not on NLTAG_SIGNUP_ALLOWLIST.` → the two values differ.

## 8. Remove the bootstrap variable immediately
**Delete `NLTAG_BOOTSTRAP_ADMIN_EMAIL`** and save, then redeploy once more. That build log must say `No admin bootstrap requested`.

## 9. Admin dashboard and audit log
1. The admin signs in (password, then code) and opens `https://nltagkuwait.com/admin`. The dashboard loads.
2. `/admin/audit` shows, for this account (mailbox-first registration; there is **no** `auth.email.verify` row — the set-password link verifies the address, and Better Auth's verify-email routes are not open): `auth.account_request.provisioned`, `auth.user.create`, `auth.account_request.link_issued` (reason `set-password`), `auth.password.reset` (the first password), `auth.session.create` with reason `sign-in/email` (the sign-in before enrollment), `auth.2fa.enroll_start`, `auth.2fa.enable`, `role.bootstrap`, and `auth.session.create` with reason `two-factor/verify-totp`. Some of these rows carry no user name by design; match them by time.
3. `/admin/staff` lists the admin with the Church Admin role.

## 10. Behaviour checks
- [ ] **Code required:** in a private window, sign in with the admin's password only. The site asks for the code; opening `/admin` in that window sends you to sign-in.
- [ ] **Wrong code:** enter `000000` (unless it is the real code) **only once**. The page says the code is not correct; you stay on the code page. (Each wrong code counts toward the 5-in-a-row lock of 15 minutes and the challenge's 5 attempts.)
- [ ] **Unlisted address:** on `/ta/sign-up`, request an account (address only, no password) for an address *not* on the list. Same "check your email" message; no email arrives (no account is created).
- [ ] **Rate limit (per address, R4 D3).** `CLIENT_IP_SOURCE` stays **unset** and `TRUSTED_PROXIES` is not configured; limits never use the visitor's IP. The runtime log line `client_ip.resolution_off` is expected (its wording "shared rate-limit bucket" predates R4 and can be ignored). **Never use the admin's or any staff address for this check.**
  1. In a private window, sign in **6 times within one minute** with the **same made-up address** (`ratecheck-1@example.invalid`) and any wrong password. Attempts 1–5: "Email or password is incorrect." Attempt 6: "Too many attempts. Please try again later." (5 checks at once, then 30 s, 1, 2, 4, 8 minutes, then 15 minutes; the address's schedule resets 3 hours after its last counted check.)
  2. Straight away, **one** wrong attempt with a **different** made-up address (`ratecheck-2@example.invalid`): "Email or password is incorrect." Limits belong to the address, so one address being slowed does not affect another.
  3. `/admin/audit` → *Sign-in and accounts*: `auth.sign_in.fail` rows and one `auth.sign_in.throttled` row (reason `account`), with no address shown. No alert email is sent (the address has no account).
  If attempt 6 is *not* refused: close accounts (§ 12) and report. If step 2 is refused: report it (it suggests a shared limit). Do **not** set `CLIENT_IP_SOURCE` to "fix" either result.
- [ ] **Two-factor enforced for the role:** the admin's *Account* page says two-factor sign-in is on, and `/admin/audit` → *Sign-in and accounts* shows `auth.2fa.enable` before `role.bootstrap`. (The bootstrap refuses an account without it; any later Church Admin without it is sent to the setup page and gets `auth.2fa.required` rows.)
- [ ] **Membership data is not reachable:** there is no membership screen in the admin (Phase 4d is not built). `/admin/members`, `/admin/membership` and `/en/account/membership` return "Not Found"; nothing in the admin lists members, birthdays or exports.
- [ ] `noindex, nofollow` still on `/ta` and `/en`. Public pages unchanged; CMS images still visible to staff only.

**Content Editor check — when the first editor is added** (see "Later" below; no extra production account is created only to test this):
- [ ] The editor can open `/admin`, create and edit drafts, upload images and *submit for review*.
- [ ] The editor **cannot publish**: the editor's item page has *Submit for review* but no *Publish*; the submitted item waits in `/admin/review` until a Church Admin publishes it. (Editors may view that list; publishing is refused for them by the server as well.)
- [ ] `/admin/staff` and `/admin/audit` return "Not Found" for the editor (no `staff.manage`, no `audit.read`).
- [ ] No membership data anywhere (as above). Two-factor is offered on *Account* but not required.

Do **not** use a recovery code just to test it: each one works once.

## 11. Recovery procedure
**A. Lost or broken phone, recovery codes available.** Sign in with the password → *Use a recovery code instead* → enter one unused code (each works once). Then *Account → Two-factor sign-in* → *Turn off two-factor sign-in* (password + another recovery code) → set it up again on the new phone (§ 6) and save the **new** codes. While two-factor is off, the admin cannot use the admin pages.

**B. Replacing the phone, old phone still working.** *Account → Two-factor sign-in* → turn off with password + current code → set up on the new phone (§ 6).

**C. Running low on recovery codes.** The page shows how many are unused. *Make new recovery codes* (password + current code) replaces all old codes.

**D. Phone and recovery codes both lost (last resort).** There is no reset button and no automatic bypass, by design. Only with the **owner's explicit approval**, given for this person on this date:
1. Confirm the person's identity outside the website (in person or by a known phone number).
2. Take a fresh backup and verify it (§ 1).
3. phpMyAdmin → `u339364475_nltag` → **SQL**. Replace `person@example.org` with the person's exact address in all four places and run the block once. It removes the authenticator and recovery codes, signs the person out everywhere and writes an audit row, all in one transaction:
   ```sql
   START TRANSACTION;
   SET @uid = (SELECT id FROM user WHERE email = 'person@example.org');
   INSERT INTO audit_log (actor_user_id, action, outcome, entity, entity_id, reason, created_at)
     SELECT NULL, 'auth.2fa.reset_by_owner', 'SUCCESS', 'user', @uid,
            'Owner-approved database reset: authenticator and recovery codes lost (runbook 11 D)', NOW(3)
     FROM DUAL WHERE @uid IS NOT NULL;
   DELETE FROM two_factor WHERE user_id = @uid;
   UPDATE user SET two_factor_enabled = 0 WHERE id = @uid;
   DELETE FROM session WHERE user_id = @uid;
   SELECT @uid AS reset_user_id, ROW_COUNT() AS sessions_removed;
   COMMIT;
   ```
   If `reset_user_id` is `NULL`, the address did not match: nothing was changed. Check the spelling and run it again.
4. `/admin/audit` now shows `auth.2fa.reset_by_owner` for that account. Also record in the church's own records: date, person, reason, who approved, who ran it (the audit row holds no names by design).
5. The person signs in with the password and sets up two-factor again at once (§ 6) with new recovery codes. For a Church Admin the admin stays closed until they do.

**E. Forgotten password.** *Forgot your password?* sends a reset link (1 hour). After the reset, sign-in still asks for the authenticator code.

**F. "Too many incorrect codes."** Wait 15 minutes, then sign in again.

## 12. Rollback (any step)
- **Close accounts at once:** set `NLTAG_ACCOUNTS_ENABLED=0` and save. Account pages, two-factor pages and `/api/auth` return 404 again immediately; accounts, roles and two-factor settings stay in the database for next time.
- If `NLTAG_BOOTSTRAP_ADMIN_EMAIL` or `NLTAG_APPROVED_PRODUCTION_MIGRATION` is still set, delete it.
- **Migration 0003** needs no rollback: it only adds an empty table and a column with a default. If it must be removed and nobody has enrolled yet: `DROP TABLE two_factor; ALTER TABLE user DROP COLUMN two_factor_enabled;` and delete the `0003` row from `__drizzle_migrations` — only with the code from before Phase 6b deployed, otherwise sign-in breaks.
- **Full restore** (phpMyAdmin import of the § 1 export) only if data was harmed.

## Later: adding Content Editors and more admins
1. Add their addresses to `NLTAG_SIGNUP_ALLOWLIST` (comma-separated, e.g. `a@example.org,b@example.org`), save.
2. They request an account on `/ta/sign-up` (or `/en/sign-up`) and choose their password from the emailed link. Content Editors may set up two-factor (recommended, not required).
3. The Church Admin grants the role in `/admin/staff` (audited; nobody can change their own role). A **new Church Admin** must set up two-factor before the role works; until then the admin sends them to the setup page.

Never set `NLTAG_BOOTSTRAP_ADMIN_EMAIL` again; it does nothing once an admin exists.
