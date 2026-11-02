# Owner runbook: open staff accounts and create the first Church Admin (Phase 6b)

**Only with the owner present, after PR #8 (Phase 5) and the Phase 6a PR are merged and deployed.**
Do the steps in order; stop and roll back (§ Rollback) if a check fails. Nothing here touches the domain, DNS, email records or Hostinger email.

Where variables live: hPanel → Websites → **nltagkuwait.com** → the Node.js app's **Environment variables** (the same list that already has `SMTP_*`, `DATABASE_URL` and `NLTAG_ACCOUNTS_ENABLED`). Saving variables restarts the app. Type values only in hPanel — never in chat, email, GitHub or a file.

What the code enforces (you cannot get these wrong by mistake):
- Accounts stay 404 in production unless `NLTAG_ACCOUNTS_ENABLED=1` **and** all `SMTP_*` are set **and** `AUTH_RATE_LIMIT=on`.
- Only addresses on `NLTAG_SIGNUP_ALLOWLIST` can create an account. Unset or mistyped list = nobody can. Everyone else sees the normal "check your email" message and nothing happens.
- The bootstrap grants the Church Admin role at most once, only to a verified account on the allowlist, writes an audit row, and prints only `granted` or `not done: <reason>`.

## 0. Before you start
- [ ] Phase 6a is deployed: the latest build log for `main` shows `No admin bootstrap requested (NLTAG_BOOTSTRAP_ADMIN_EMAIL not set).`
- [ ] You know the first admin's address (a church staff mailbox the admin can open).
- [ ] `/ta/sign-in` still returns "Not Found".

## 1. Fresh database backup
1. hPanel → Databases → phpMyAdmin → `u339364475_nltag` → **Export** → Custom → all tables, structure and data, SQL → download as `nltag-db-before-admin-YYYYMMDD-HHMM.sql`.
2. Open the file: it must end with the last table's data and list `__drizzle_migrations` with **3** rows (`0000`, `0001`, `0002`).
3. Optionally hPanel → Backups → Database backups → generate. Keep the export off the server.

## 2. Open accounts for the first admin only
Add these two variables and save (the app restarts):

| Name | Value |
|---|---|
| `AUTH_RATE_LIMIT` | `on` |
| `NLTAG_SIGNUP_ALLOWLIST` | the first admin's address (only that one for now) |

Then change `NLTAG_ACCOUNTS_ENABLED` from `0` to `1` and save.

Check (private window): `/ta/sign-in` and `/ta/sign-up` now load; `/ta` still has `noindex` (page source contains `noindex, nofollow`); `/admin` sends you to the sign-in page.

## 3. First admin signs up and verifies
1. The admin opens `https://nltagkuwait.com/ta/sign-up`, enters name, the listed address and a password of 10+ characters.
2. The verification email arrives in that mailbox (Tamil and English). Open the link within 24 hours. The page confirms the address is verified.
3. If no email arrives within 10 minutes: check spam; check the address matches the allowlist exactly; then roll back and report.

## 4. Grant the Church Admin role (one build)
1. Add `NLTAG_BOOTSTRAP_ADMIN_EMAIL` = the same address. Save.
2. Trigger a **rebuild/redeploy** of the app from hPanel (the grant runs during the build, after `next build`).
3. In the build log, find exactly one of:
   - `Admin bootstrap: Church Admin role granted. …` → continue.
   - `Admin bootstrap not done: <reason>` → fix the reason (for example the account is not verified yet), then rebuild again. The deploy itself still succeeds.
4. **Delete `NLTAG_BOOTSTRAP_ADMIN_EMAIL`** and save, then redeploy once more. That build log must say `No admin bootstrap requested`.

## 5. Admin signs in
1. Sign in at `/ta/sign-in`, open `https://nltagkuwait.com/admin`.
2. `/admin/audit` shows a `role.bootstrap` entry.
3. Two-factor sign-in is **not** part of this phase (owner decision pending).

## 6. Behaviour checks
- [ ] **Unlisted address:** in a private window, sign up with an address *not* on the list. The page shows the same "check your email" message and no email arrives at that address (no account is created).
- [ ] **Rate limit:** sign in with the admin address and a wrong password 6 times within 15 minutes. The 6th attempt shows "Too many attempts". Wait 15 minutes before the real sign-in. If the 6th attempt is *not* blocked, roll back (step 7) and report: client-IP detection behind Hostinger's proxy needs checking (`TRUSTED_PROXIES`).
- [ ] `noindex, nofollow` still on `/ta` and `/en`.
- [ ] Public pages unchanged; images in the CMS are still visible to staff only.

## 7. Rollback (any step)
Set `NLTAG_ACCOUNTS_ENABLED=0` and save. Account pages and `/api/auth` return 404 again at once; existing accounts and roles stay in the database. If `NLTAG_BOOTSTRAP_ADMIN_EMAIL` is still set, delete it. A full database restore (phpMyAdmin import of the step 1 export) is only needed if data was harmed.

## Later: adding Content Editors and more admins
1. Add their addresses to `NLTAG_SIGNUP_ALLOWLIST` (comma-separated, for example `a@example.org,b@example.org`), save.
2. They sign up and verify.
3. The Church Admin grants the role in `/admin` (audited; nobody can change their own role).
Never set `NLTAG_BOOTSTRAP_ADMIN_EMAIL` again; it does nothing once an admin exists.
