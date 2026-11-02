# Owner runbook: open staff accounts and create the first Church Admin (with two-factor)

**Phase 6b. Only with the owner present, in an approved activation window, after the Phase 6b PR is merged and deployed.**
Do the steps in order. Stop and roll back (§ 12) if any check fails. Nothing here touches the domain, DNS, email records, SMTP settings or Hostinger email.

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
- [ ] The **43 Phase 4b** and the **Phase 6b two-factor** Tamil strings are approved, or you accept that Tamil account pages show draft wording (English pages are unaffected).
- [ ] You have a way to keep the first admin's recovery codes offline (printed and locked away, or in a password manager).

## 1. Fresh database backup
1. hPanel → Databases → phpMyAdmin → `u339364475_nltag` → **Export** → Custom → all tables, structure and data, SQL → download as `nltag-db-before-admin-YYYYMMDD-HHMM.sql`.
2. Open the file: it must end with the last table's data and list `__drizzle_migrations` with **3** rows (`0000`, `0001`, `0002`).
3. Optionally hPanel → Backups → Database backups → generate. Keep the export off the server.

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

Check (private window): `/ta/sign-in` and `/ta/sign-up` load; `/ta` still has `noindex` (page source contains `noindex, nofollow`); `/admin` sends you to the sign-in page.

## 4. First admin registers
The admin opens `https://nltagkuwait.com/ta/sign-up` (or `/en/sign-up`), enters name, the listed address and a password of 10+ characters, and submits. The page says to check email.

## 5. Email verification
1. The verification email arrives in that mailbox (Tamil and English). Open the link within 24 hours. The page confirms the address is verified and the admin is signed in.
2. No email within 10 minutes: check spam; check the address matches the allowlist exactly; otherwise roll back (§ 12) and report.

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
     - `the account's email is not verified yet.` → do § 5.
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
- [ ] **Rate limit:** sign in with the admin address and a wrong password 6 times within 15 minutes. The 6th attempt shows "Too many attempts". Wait 15 minutes before the real sign-in. If the 6th is *not* blocked, roll back (§ 12) and report: client-IP detection behind Hostinger's proxy needs checking (`TRUSTED_PROXIES`).
- [ ] `noindex, nofollow` still on `/ta` and `/en`. Public pages unchanged; CMS images still visible to staff only.

Do **not** use a recovery code just to test it: each one works once.

## 11. Recovery procedure
**A. Lost or broken phone, recovery codes available.** Sign in with the password → *Use a recovery code instead* → enter one unused code (each works once). Then *Account → Two-factor sign-in* → *Turn off two-factor sign-in* (password + another recovery code) → set it up again on the new phone (§ 6) and save the **new** codes. While two-factor is off, the admin cannot use the admin pages.

**B. Replacing the phone, old phone still working.** *Account → Two-factor sign-in* → turn off with password + current code → set up on the new phone (§ 6).

**C. Running low on recovery codes.** The page shows how many are unused. *Make new recovery codes* (password + current code) replaces all old codes.

**D. Phone and recovery codes both lost (last resort, owner present).** There is no reset button by design. With the owner's approval:
1. Take a fresh backup (§ 1).
2. phpMyAdmin → `u339364475_nltag` → SQL, with the person's exact address in both places:
   ```sql
   DELETE FROM two_factor WHERE user_id = (SELECT id FROM user WHERE email = 'person@example.org');
   UPDATE user SET two_factor_enabled = 0 WHERE email = 'person@example.org';
   DELETE FROM session WHERE user_id = (SELECT id FROM user WHERE email = 'person@example.org');
   ```
3. The person signs in with the password and must set up two-factor again at once (§ 6) — the admin stays closed to them until they do.
4. This database change is **not** in the site's audit log. Record it in the church's own records (date, who, why, who approved).

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
