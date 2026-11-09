# Staging environment (staging.nltagkuwait.com)

**Status:** repository side built and tested (Nov 2026). The Hostinger side is **not configured yet**: the owner performs the hPanel steps below (Claude has no hPanel access). Nothing here changes production.

## 1. Architecture

| | Production (unchanged) | Staging (new) |
|---|---|---|
| Address | `https://nltagkuwait.com` | `https://staging.nltagkuwait.com` |
| Hostinger Node.js app | existing app | **second** Node.js app (plan allows 5; 1 used) |
| Git branch | `main` (auto-deploy) | `staging` (auto-deploy) |
| Database | `u339364475_nltag` | `u339364475_staging` (own user `u339364475_staging`, no grant on production) |
| Auth secret | production secret | own secret starting `nltag-staging-` |
| Media folder | `/home/u339364475/nltag-data/media` | `/home/u339364475/nltag-data-staging/media` |
| Mail | Gmail SMTP | **captured to files** (`…/nltag-data-staging/mail-capture`), never delivered |
| Indexing | `noindex,nofollow` (pre-launch) | `noindex,nofollow` + `X-Robots-Tag` + `robots.txt Disallow: /` |
| Marker | none | `[STAGING]` banner on every page, `[STAGING]` in titles and email subjects |
| Data | church data | fictional only (`[E2E …]`, `…@nltag.test`) |

Both apps share the Hostinger account (CPU, disk, the same Unix user), so separation is enforced **in the application** as well as by configuration.

## 2. How staging is kept away from production (fails closed)

Code: `src/server/deployment/environment.ts` (rules), `verify.ts` (live checks), `migration-target.ts`; tests `tests/unit/staging-safety.test.ts`, `tests/integration/staging-isolation.test.ts`.

1. **Staging is explicit.** Only `NLTAG_DEPLOYMENT=staging` selects staging. A site whose address names staging but lacks the variable is refused (it would otherwise behave like production).
2. **Configuration rules** (checked by `serverEnv()` on every server use, by the build and by every script). Problems are reported by variable **name** only, never value:
   - `DATABASE_URL`: database name **and** user must contain `staging`.
   - `BETTER_AUTH_SECRET`: must start with `nltag-staging-`, ≥ 48 characters (a production secret never does).
   - `NLTAG_MEDIA_DIR`: required, absolute, path names staging, must not be, contain or sit inside `/home/u339364475/nltag-data`.
   - Mail: no `SMTP_*` at all (capture mode, default); or `NLTAG_STAGING_MAIL=sandbox` with a sandbox host only (`sandbox.smtp.mailtrap.io`, `smtp.ethereal.email`).
   - `NLTAG_STAGING_MAIL_DIR` (optional; default `mail-capture` next to the media folder): absolute, names staging, never in or around the production data folder.
   - Refused in staging: `NLTAG_APPROVED_PRODUCTION_MIGRATION`, `NLTAG_BOOTSTRAP_ADMIN_EMAIL`, `GOOGLE_CLIENT_*`; `NLTAG_SIGNUP_ALLOWLIST`, `NLTAG_CHURCH_INBOX` and `NLTAG_STAGING_BOOTSTRAP_ADMIN_EMAIL` accept reserved test addresses only (`…@nltag.test`, `example.com`).
   - Production gets the reverse checks: a staging secret, a staging database name or a staging media folder is refused there.
3. **Live checks, not names.** At start-up (`src/instrumentation.ts`) and before every staging build, migration and seed:
   - the database server is asked which database it connected to (`SELECT DATABASE()`); it must contain `staging` **and** hold the marker row `nltag_environment.environment = 'staging'`. The production database has no marker, so it is refused; a populated database without the marker is refused; an empty one is claimed only by `staging:init`.
   - the media folder's real path (symlinks resolved) must not overlap the production data folder, and its `.nltag-environment` file must say `staging`; a non-empty folder without the marker is refused.
4. **Until the live check passes, staging refuses** all database access (`getPool()`), media reads/writes and mail capture. `/api/health` answers `503`.
5. **Migrations:** staging only through `npm run staging:migrate` (requires staging, refuses the production flag, verifies the marker first). The ordinary `db:migrate` refuses a staging deployment, and still refuses production without `NLTAG_APPROVED_PRODUCTION_MIGRATION=1`. Staging has its own `__drizzle_migrations` table in its own database.
6. **No production administrator.** The production bootstrap variable is refused; staging uses `NLTAG_STAGING_BOOTSTRAP_ADMIN_EMAIL` (reserved test address, staging database only, same rules: verified account with two-factor, first admin only).
7. **Fixtures cannot sign in.** `staging:seed` adds `[E2E …]` content; its author records have no password, no two-factor and no role (the repository's seed password is public).
8. **Mail never leaves.** Capture mode writes each message (subject prefixed `[STAGING]`) to the mail-capture folder (files 0600). Testers open set-password links there through hPanel → File Manager.

## 3. Variables for the staging app (names and how to make values; never copy production values)

| Variable | Value | Notes |
|---|---|---|
| `NLTAG_DEPLOYMENT` | `staging` | required |
| `DATABASE_URL` | `mysql://u339364475_staging:<password>@127.0.0.1:3306/u339364475_staging` | the password you create in step 4; URL-encode special characters |
| `BETTER_AUTH_SECRET` | `nltag-staging-` + output of `openssl rand -hex 32` | new; never production's |
| `BETTER_AUTH_URL` | `https://staging.nltagkuwait.com` | |
| `NLTAG_MEDIA_DIR` | `/home/u339364475/nltag-data-staging/media` | created automatically (0700) |
| `NLTAG_ACCOUNTS_ENABLED` | `1` | staging accounts with captured mail |
| `AUTH_RATE_LIMIT` | `on` | required for accounts |
| `NLTAG_SIGNUP_ALLOWLIST` | e.g. `admin@nltag.test,editor@nltag.test,prayer@nltag.test` | test addresses only |
| `NLTAG_PUBLIC_FORMS` | `1` | prayer, contact, testimony forms and gallery (needs migration 0004, applied by the staging build) |
| `NLTAG_DATA_KEY` | output of `openssl rand -hex 32` | encrypts prayer requests; new, staging only |
| `NLTAG_CHURCH_INBOX` | `office@nltag.test` | notification address (captured) |
| `NLTAG_STAGING_MIGRATE` | `1` | migrate on each build |
| `NLTAG_STAGING_INIT` | `1` for the **first** build only | then remove |
| `NLTAG_STAGING_SEED` | `1` (optional) | fictional `[E2E …]` content |
| `EMAIL_DAILY_CAP` | `300` | |
| **Do not set** | `SMTP_*`, `GOOGLE_*`, `NLTAG_APPROVED_PRODUCTION_MIGRATION`, `NLTAG_BOOTSTRAP_ADMIN_EMAIL`, `CLIENT_IP_SOURCE` | refused or not needed |

## 4. hPanel procedure (owner)

Work only inside the new staging website. Do **not** open or edit the production website's settings, database or variables at any step. Where a menu label differs slightly in your hPanel, choose the equivalent; if a step would touch `nltagkuwait.com` itself, stop and ask.

**Before anything is pushed (production safety, decision D1):**
1. Open the **production** website's GitHub/deployment settings **read-only** and check whether pull-request previews are enabled (PR #25 shows a Hostinger preview at `powderblue-fly-151112.hostingersite.com`). Tell Claude which environment variables previews use. If previews share production's variables (and so its database), disable previews before any branch with migration `0004` is pushed. This is the only production-side check, and it changes nothing unless you decide to turn previews off.

**Create staging:**
2. **Approve the push.** Claude pushes branch `staging` (and the work branch) only after you say so.
3. hPanel → **Websites → Add website → Node.js web app**. Domain: choose **use an existing domain → subdomain** and enter `staging` on `nltagkuwait.com` (creates `staging.nltagkuwait.com`). Do not choose `nltagkuwait.com` itself and do not create an alias of the production site.
4. In the new staging website → **Databases → Management**: create database name suffix `staging`, user suffix `staging` (giving `u339364475_staging` / `u339364475_staging`), a new strong password. Do not grant this user anything on `u339364475_nltag`. Keep the password only in the variable of step 6.
5. Staging website → **GitHub / Git deployment**: connect `binnysam/nltagwebsite`, branch **`staging`**. Build settings: Node.js **22**, framework **Next.js**, package manager **npm**, root = document root, build script **`build:hostinger`**, output **`.next`** (the same shape as production; the variables decide it is staging).
6. Staging website → **Environment variables**: enter the table in §3 (with `NLTAG_STAGING_INIT=1` for this first build). Do not paste anything from the production website.
7. **SSL**: staging website → Security/SSL → install the free certificate for `staging.nltagkuwait.com`, then turn on the HTTPS redirect. DNS: the subdomain record is created by Hostinger in step 3; do not edit the `nltagkuwait.com`, MX, SPF, DKIM or DMARC records.
8. **Deploy** (or wait for the auto-deploy). In the build log you should see `Staging check passed: configuration, database (name and marker), media folder (marker).` then `Migrations applied.` If it says `Staging check failed: …`, the message names the variable or rule; fix it and redeploy.
9. Remove `NLTAG_STAGING_INIT` (keep `NLTAG_STAGING_MIGRATE=1`).

**Check it:**
10. Open `https://staging.nltagkuwait.com/api/health` → `{"status":"ok","deployment":"staging","database":true,"stagingVerified":true}`.
11. Open `https://staging.nltagkuwait.com/ta` → the yellow **STAGING** banner is at the top; `…/robots.txt` says `Disallow: /`.
12. Open `https://nltagkuwait.com/api/health` only after a future production release; production is untouched by all of the above.

**Staging accounts (fictional):**
13. On staging, request an account for `admin@nltag.test` (Sign up). hPanel → File Manager → `/home/u339364475/nltag-data-staging/mail-capture/` → open the newest file → copy the set-password link into the browser → set a password → set up two-factor in your authenticator app.
14. Add `NLTAG_STAGING_BOOTSTRAP_ADMIN_EMAIL=admin@nltag.test`, redeploy, read `Admin bootstrap: Church Admin role granted…` in the build log, remove the variable. Grant `editor@…` and `prayer@…` roles from Admin → Staff and roles.

## 5. Data key (prayer requests)

`NLTAG_DATA_KEY` encrypts prayer request name, contact and text. Losing it loses the stored requests; changing it makes earlier requests unreadable. Staging and production must have **different** keys. For production (later, owner approval), generate a new key, store it in hPanel and in the church's password manager held by two named people (roadmap D4).

## 6. Running "staging" locally (what the QA pass used)

```bash
NLTAG_DEPLOYMENT=staging NODE_ENV=production BETTER_AUTH_URL=http://127.0.0.1:3200 \
BETTER_AUTH_SECRET=nltag-staging-<64 hex> DATABASE_URL=mysql://nltag_staging:…@127.0.0.1:3306/nltag_staging_local \
NLTAG_MEDIA_DIR=/tmp/nltag-data-staging/media … npm run staging:init && npx next build && npx next start -p 3200
```
