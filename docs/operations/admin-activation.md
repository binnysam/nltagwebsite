# Owner runbook: open staff accounts and create the first Church Admin (with two-factor)

**Phase 6b. Only with the owner present, in an approved activation window, after the Phase 6b PR is merged and deployed.**
Do the steps in order. Stop and roll back (§ 12) if any check fails. Nothing here touches the domain, DNS, email records, SMTP settings or Hostinger email.

**Owner decisions recorded (2 Nov 2026):** Church Admin — authenticator-app (TOTP) two-factor mandatory; Content Editor — optional for now; Google sign-in stays unconfigured; no trusted devices; recovery codes single-use, regenerating them voids all old codes; turning two-factor off needs password **and** a current code; phone and recovery codes both lost → the database reset in § 11 D, only with explicit owner approval and an audit row, never an automatic bypass. All 38 needed Phase 4b account/email and 45 Phase 6b two-factor Tamil strings are approved.

## Which steps need a Hostinger build, which do not

Hostinger masks variable values and applies them when the app (re)starts. Saving a variable restarts the app; that is enough for runtime settings. Two things run **only during a build** (`scripts/hostinger-build.mjs`): the database migration and the first-admin bootstrap. Those need *Save → trigger a rebuild/redeploy*.

| Step | What | How it takes effect |
|---|---|---|
| § 1 | Database backup | phpMyAdmin (no app change) |
| § 2 | Migration `0003_two_factor` | **Build** with `NLTAG_APPROVED_PRODUCTION_MIGRATION=1`, then remove it and **build** again |
| § 3 | `AUTH_RATE_LIMIT`, `NLTAG_SIGNUP_ALLOWLIST`, `NLTAG_ACCOUNTS_ENABLED=1` | Save variables (app restart); no build |
| § 4–6 | Register, verify email, enroll authenticator, save recovery codes | In the app (browser + phone) |
| § 7 | Bootstrap with `NLTAG_BOOTSTRAP_ADMIN_EMAIL` | **Build** |
| § 8 | Remove `NLTAG_BOOTSTRAP_ADMIN_EMAIL` | Save, then **build** once more to confirm the log |
| § 9–10 | Admin, audit, 2FA, Content Editor and membership checks | In the app |
| § 12 | Close accounts (`NLTAG_ACCOUNTS_ENABLED=0`) | Save variable (app restart); no build |

If a saved variable does not seem to apply (for example the account pages still 404 after § 3), use *Restart* on the Node.js app, or a redeploy — never change other settings to force it.

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
- [ ] PR #10 is merged and the Hostinger build for that `main` commit **completed** (its log: `No migration requested`, `No admin bootstrap requested`).
- [ ] Tamil: the 38 Phase 4b and 45 Phase 6b strings are approved (2 Nov 2026, `docs/content/tamil-content-review.md`). Only `auth.google` and `auth.or` stay draft; they appear only if Google sign-in is configured, and it is not.
- [ ] You have a way to keep the first admin's recovery codes offline (printed and locked away, or in a password manager).
- [ ] **R4 (Nov 2026):** the R4 v6.1 PR is merged and deployed (gate G-C); the D9 set-password strings, Tamil included, are approved (gate G-D); first Church Admin activation is approved (gate G-E).
- [ ] **R4:** production `__drizzle_migrations` is confirmed to contain `0003_two_factor` (or § 2 is done first).
- [ ] **R4 environment checklist** (hPanel → the site's environment variables; names and values checked by the owner, nothing copied out): `CLIENT_IP_SOURCE` is **not set**; none of these test/harness values is present — `NODE_TLS_REJECT_UNAUTHORIZED=0`; a `BETTER_AUTH_SECRET` containing `test-only` or `harness-only`; a `DATABASE_URL` containing `nltag-local-dev-only` or `ci-only`; `SMTP_HOST` of `127.0.0.1`/`localhost`; `SMTP_USER` or `SMTP_PASS` of `harness`. (The site also refuses to start with any of them.) `NLTAG_RECOGNISED_BROWSER_KEY_VERSION` is unset or a positive integer.

## 1. Fresh database backup
1. hPanel → Databases → phpMyAdmin → `u339364475_nltag` → **Export** → Custom → all tables, structure and data, SQL → download as `nltag-db-before-admin-YYYYMMDD-HHMM.sql`.
2. **Verify it:** the file is not empty, ends with the last table's data (no error text at the end), contains `CREATE TABLE` for `user`, `session`, `audit_log` and the CMS tables, and lists `__drizzle_migrations` with **3** rows (`0000`, `0001`, `0002`). In phpMyAdmin note the row count of `audit_log` and of one CMS table; the same `INSERT` rows must be in the file.
3. Also hPanel → Backups → Database backups → generate. Keep the export off the server and off shared computers.

## 2. Apply migration `0003_two_factor` (one build, owner-approved)
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

## 4. First admin requests the account (R4 mailbox-first)
**Only after the owner has approved the D9 Tamil and English set-password strings (gate G-D).**
The admin opens `https://nltagkuwait.com/ta/sign-up` (or `/en/sign-up`), enters **only** the listed address and submits. The page always says to check email (the same for every address); there is no password on this form.

## 5. Choose the first password from the email
1. The set-password email ("Set your password", Tamil and English), sent through the church's Gmail SMTP, arrives in that mailbox. Open the link **within 1 hour**; it opens `/ta|en/set-password`. Choose a password of 10+ characters and save. Using the link proves the mailbox: the address is now verified. The link does **not** sign in, and any other set-password or reset link for the account stops working.
2. Sign in at `/ta/sign-in` with the address and the new password.
3. No email within 10 minutes: check spam; check the address matches the allowlist exactly; then request again (at most 3 requests per 15 minutes reach the mailbox; at most 3 emails per hour). Still nothing: roll back (§ 12) and report.

## 6. Authenticator enrollment and verification (the admin, on their phone and computer)
1. Signed in, open **Account** (`/ta/account`) → **Set up two-factor sign-in** (`/ta/account/two-factor`).
2. **Step 1:** enter the account password → *Continue*.
3. **Step 2:** in the authenticator app, *Add account* → *Scan QR code* and scan the code on screen. If scanning fails, choose *Enter a setup key* and type the **setup key** shown (time-based). The app now shows **NLTAG** with a 6-digit code that changes every 30 seconds.
4. **Step 3:** save the **10 recovery codes**: *Download the codes as a text file*, then print it or store it in a password manager, and delete the downloaded copy from shared computers. They are shown only once. Tick *I have saved my recovery codes in a safe place*.
5. Enter the current 6-digit code from the app → *Turn on two-factor sign-in*. The page says two-factor is now on and other devices were signed out.
6. **Check it works:** sign out, sign in again with the password — the site now asks for the 6-digit code — enter it and reach *Account*. Two-factor sign-in shows as on.

If the code is refused: check the phone clock is automatic, wait for a new code, try again. Five wrong codes in a row lock code entry for 15 minutes.

## 7. Grant the Church Admin role (one build)
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
2. `/admin/audit` shows, for this account: `auth.user.create`, `auth.email.verify`, `auth.2fa.enroll_start`, `auth.2fa.enable`, `role.bootstrap`, and `auth.session.create` with reason `two-factor/verify-totp`.
3. `/admin/staff` lists the admin with the Church Admin role.

## 10. Behaviour checks
- [ ] **Code required:** in a private window, sign in with the admin's password only. The site asks for the code; opening `/admin` in that window sends you to sign-in.
- [ ] **Wrong code:** enter `000000` (unless it is the real code). The page says the code is not correct; you stay on the code page.
- [ ] **Unlisted address:** sign up with an address *not* on the list. Same "check your email" message; no email arrives (no account is created).
- [ ] **Rate limit (per visitor):** first confirm `CLIENT_IP_SOURCE` is set and the runtime log's `client_ip.shape` lines show `"resolution":"ok"` (`docs/backend/client-ip.md` §5). Then, from one device, sign in with a wrong password 6 times within 15 minutes, using a **different made-up address each time** (e.g. test1@example.invalid … test6@example.invalid): the 6th shows "Too many attempts". From a **different network** (e.g. phone on mobile data), one wrong attempt with yet another made-up address still shows "Email or password is incorrect" — visitors no longer block one another. Never use the admin's address here: each address allows only 5 password checks before its delay starts. If the 6th is *not* blocked, roll back (§ 12) and report. If the second network is also blocked, per-visitor detection is not working: report the `client_ip.shape` lines (they contain no addresses).
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
2. They sign up and verify. Content Editors may set up two-factor (recommended, not required).
3. The Church Admin grants the role in `/admin/staff` (audited; nobody can change their own role). A **new Church Admin** must set up two-factor before the role works; until then the admin sends them to the setup page.

Never set `NLTAG_BOOTSTRAP_ADMIN_EMAIL` again; it does nothing once an admin exists.
