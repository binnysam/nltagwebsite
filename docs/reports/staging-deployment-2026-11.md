# Staging deployment: report (9 November 2026)

**Result:** the separate staging application `staging.nltagkuwait.com` is created, built from `claude/elegant-pasteur-es9mnm` @ `5300990`, connected to its own new database and media folder, and running with the staging safety check verified. **Production was not modified.** Live checks over HTTPS were run from this session after network access to `staging.nltagkuwait.com` (only that host) was approved.

Every result below comes from the Hostinger API (build log, runtime log, settings) or from this repository's code. No secret value appears in this report, the build log or the runtime log.

## 1. Staging application: created

| | Value (verified through the API) |
|---|---|
| Website | `staging.nltagkuwait.com`, vhost type **addon** (its own website, not an alias or subdomain of production) |
| Document root | `/home/u339364475/domains/staging.nltagkuwait.com/public_html` (production: `/home/u339364475/domains/nltagkuwait.com/public_html`, unchanged) |
| App files | `/home/u339364475/domains/staging.nltagkuwait.com/hbuilds/versions/<build>/nodejs` |
| Build settings | Node.js **22**, app type **next**, script **`build:hostinger`**, output `.next`, npm, root `.` |
| Git | `binnysam/nltagwebsite`, branch **`claude/elegant-pasteur-es9mnm`**, auto-deploy **on** (same GitHub installation as production; production's auto-deploy is still `main`) |
| Process | its own Next.js server (Hostinger's managed Node.js process for this website); restarts on deploy or variable change |

## 2. Subdomain and SSL

- DNS (created by Hostinger with the website): `staging` A `147.93.92.185`, `staging` AAAA, `www.staging` CNAME, `ftp.staging` A. **No existing record changed**: `@`, `www`, MX, SPF, DMARC, DKIM, `resend._domainkey` and `send` are identical to the baseline taken before the change.
- SSL: **active** (Hostinger lifetime SSL, expires 2027-02-07), **HTTPS redirect on**. Hostinger CDN is on, as for production.
- Live: `https://staging.nltagkuwait.com` serves a Let's Encrypt certificate for `CN=staging.nltagkuwait.com` (expires 7 Feb 2027) over HTTP/2. Not checked from here: the `http://` → `https://` redirect, because this session's proxy carries HTTPS only. The API reports the redirect as on.

## 3. Staging database: created

`u339364475_staging`, its own user `u339364475_staging` (generated password, 32 characters, stored only in the staging website's `DATABASE_URL`), assigned to `staging.nltagkuwait.com`. Production `u339364475_nltag`: same record, `updated_at` still 2026-11-02 05:35:18, size unchanged.

The identity was checked before migrating. The first build's log shows the init path claiming the empty database, verifying it, then migrating:

```
Staging build: checking that the database and media folder are staging's own.
Staging check passed: configuration, database (name and marker), media folder (marker).
Staging database verified (name and marker).
Migrating database on 127.0.0.1…
Migrations applied.
```

## 4. Migrations applied (staging database only)

`0000`–`0004` (`0004_forms_gallery` included) were applied by `staging:migrate` to `u339364475_staging` after the marker check. The run repeated once in the same build (a no-op). Evidence: the "Migrations applied" lines above, and the staging database growing from 1 MB to 3 MB. Production's database was not reached: the staging check refuses any database whose name lacks `staging` or that has no marker, and the URL names only the staging database.

Not done: reading the `__drizzle_migrations` rows directly. This needs phpMyAdmin (Hostinger has no SQL API). Owner check: phpMyAdmin → `u339364475_staging` → `SELECT id, created_at FROM __drizzle_migrations;` should return 5 rows, and `SELECT * FROM nltag_environment;` → `environment | staging`.

## 5. Environment variables: independent, configured

All values are new and generated for staging; nothing was copied from production. Values are masked by Hostinger and not recorded anywhere else. Staging now has 15 variables:

`NLTAG_DEPLOYMENT=staging` · `DATABASE_URL` (staging db/user, 127.0.0.1) · `BETTER_AUTH_SECRET` (`nltag-staging-` + 64 hex) · `BETTER_AUTH_URL=https://staging.nltagkuwait.com` · `NLTAG_MEDIA_DIR=/home/u339364475/nltag-data-staging/media` · `NLTAG_STAGING_MAIL_DIR=/home/u339364475/nltag-data-staging/mail-capture` · `NLTAG_STAGING_MAIL=capture` · `NLTAG_ACCOUNTS_ENABLED=1` · `AUTH_RATE_LIMIT=on` · `NLTAG_SIGNUP_ALLOWLIST=admin@nltag.test,editor@nltag.test,prayer@nltag.test` · `NLTAG_PUBLIC_FORMS=0` · `NLTAG_DATA_KEY` (new 64 hex) · `NLTAG_CHURCH_INBOX=office@nltag.test` · `EMAIL_DAILY_CAP=300` · `NLTAG_STAGING_MIGRATE=1`.

- `NLTAG_STAGING_INIT=1` and `NLTAG_STAGING_SEED=1` were used for the first build only, then removed.
- **Not set:** `SMTP_*`, `GOOGLE_*`, `NLTAG_APPROVED_PRODUCTION_MIGRATION`, `NLTAG_BOOTSTRAP_ADMIN_EMAIL`, `NLTAG_STAGING_BOOTSTRAP_ADMIN_EMAIL`, `CLIENT_IP_SOURCE`.
- The exact set was checked against the code's own rules before deploying (`deploymentConfigProblems` → no problems; accounts gate → on).
- Accounts: staff account requests are limited to the three reserved `@nltag.test` addresses (fail-closed allowlist). There is no membership registration in this code base. No Church Admin exists on staging, and no production admin was touched.

Production still has the same 12 variable names as at the baseline.

## 6. Media and email isolation

| Check | Result |
|---|---|
| Media folder | Runtime log at start-up: `[nltag-deployment] {"status":"verified"}` and `[nltag-media-storage] {"dir":"/home/u339364475/nltag-data-staging/media","source":"env","writable":true,"readBack":true,"dirMode":"700",…}`. The marker file was created at the first start and found at the second start |
| Not production's | The staging check resolves real paths (symlinks too) and refuses `/home/u339364475/nltag-data` or anything inside or around it. The build-time and runtime checks both passed with the configured folder, which is outside it |
| Cannot write to production storage | Shown locally with the same code: a media folder inside `<home>/nltag-data` is refused (exit 1, `NLTAG_MEDIA_DIR: must not be, contain or sit inside the production data folder`), and so is a mail folder there (fixed in `5300990`) |
| Mail | No `SMTP_*` on staging; capture mode writes JSON files to `/home/u339364475/nltag-data-staging/mail-capture` (created on the first message). Real delivery is impossible with this configuration: the transport has no SMTP route in capture mode |
| Live mail capture test | One account request for the fictional `admin@nltag.test` on `/en/sign-up` → "Check your email…" reply; the runtime log has no mail failure. A send failure in capture mode is logged and audited, so this points to the message being written to `mail-capture`. Not seen directly: the folder is outside the website root and the file API cannot read it, so you confirm it in File Manager (§9) |

## 7. Deployment

Build `01a1c24d-8759-71d1-ac46-240db5a9a9ae`: cloned `5300990` → `npm install` → staging check → init + migrate → seed (fictional `[E2E …]` content only) → `next build` → published → restarted. **State: completed** (2 min 59 s). The app started on port 3000 under Hostinger's proxy, and the runtime safety check reported `verified`. After the variables changed, the process stopped cleanly (SIGTERM, drained); Hostinger starts it again on the next request.

## 8. Test results

| Test | Result |
|---|---|
| Configuration rules on the exact staging values | pass (0 problems) |
| Build on Hostinger (staging check, migrations 0000–0004, seed, Next.js build) | **pass** |
| Runtime start-up check on Hostinger | **pass** (`verified`; media probe writable, mode 700) |
| SSL certificate and HTTPS redirect (API) | **active, on** |
| `GET /api/health` (live) | **pass**: `{"status":"ok","deployment":"staging","database":true,"stagingVerified":true}` |
| `/ta`, `/en` (live) | **pass**: 200, `x-robots-tag: noindex, nofollow, noarchive`, `<meta name="robots" content="noindex, nofollow">`, title `[STAGING] …`, `data-environment="staging"` banner, canonical `https://staging.nltagkuwait.com/<locale>` |
| `/robots.txt` (live) | **pass**: `User-agent: * / Disallow: /` |
| Forms off (live) | **pass**: `/ta/prayer`, `/en/gallery`, `/en/testimonies/share` → 404; `/ta/contact` has no form; `/en/design-system` → 404; `/admin` → 307 (sign-in) |
| Account request (live, fictional address) | **pass**: "Check your email…" reply; no error in the runtime log |
| Browser suite `staging.spec.ts`, live: `/en`, `/ta` sermons and contact pages (axe WCAG 2.2 AA, 44 px targets, no sideways scroll) and contact map placeholder, phone + desktop | **10 passed** |
| Browser suite, live: environment-indicator test | **failed on its last assertion only, by design of the test**. It was written for a local URL and requires the canonical not to contain `nltagkuwait.com`, which `staging.nltagkuwait.com` necessarily does. Every earlier assertion in it passed (200, `X-Robots-Tag`, banner, title, robots meta, canonical = staging origin). Test not changed |
| Browser suite, live: robots/health test | **not runnable from here**: Playwright's Node-side request client bypasses this session's proxy (`ENOTFOUND`). The same assertions were verified with `curl` above |
| Browser suite: forms, inboxes, gallery, staff flow | **not run**: forms are off by instruction, and these tests read captured mail and run the staff bootstrap from local disk |
| Earlier tonight, locally on the same code (MariaDB 11.8.9) | `npm run verify` pass (378 unit) · `npm run test:integration` pass (286 + 6) · staging browser suite 38 passed, 4 skipped |

Network: this session was given access to `staging.nltagkuwait.com` only (a personal cloud environment named `nltagwebsite`). Production hosts stay unreachable from it.

## 9. What needs you

1. **Quick look** (optional; the same checks passed from here): open `https://staging.nltagkuwait.com/ta` and see the STAGING banner. Also check that `http://staging.nltagkuwait.com` redirects to `https://` (the only check this session could not make).
2. **phpMyAdmin check** (§4): 5 migration rows and the `staging` marker in `u339364475_staging`.
3. **Email capture proof + staff testing:** a request for `admin@nltag.test` was made at 22:00 UTC. hPanel File Manager → `/home/u339364475/nltag-data-staging/mail-capture/` → open the newest file → set-password link → set a password and two-factor. Then set `NLTAG_STAGING_BOOTSTRAP_ADMIN_EMAIL=admin@nltag.test` for one deploy to make it the staging Church Admin (reserved test address; staging database only). The set-password link expires after 1 hour; request again if needed. The file is the direct proof of email capture.
4. **Public forms** stay off (`NLTAG_PUBLIC_FORMS=0`), as instructed. Turn them on only for a QA session.
5. **Staging secrets** (database password, `BETTER_AUTH_SECRET`, `NLTAG_DATA_KEY`) were generated for staging and exist only in hPanel (staging website → Environment variables; masked) and nowhere else. They protect fictional data only. If you want a copy, regenerate them in hPanel: database password under Databases → `u339364475_staging` → change password, then update `DATABASE_URL`.
6. **Auto-deploy:** every push to `claude/elegant-pasteur-es9mnm` rebuilds staging (never production). Pushing this report (documentation only) triggered one such rebuild; the code it runs is unchanged from `5300990`.

## 10. Production: not modified

Compared with the baseline taken before any change:

| | Before | After |
|---|---|---|
| Website / docroot | `nltagkuwait.com`, main vhost, same docroot | same |
| Latest build | `01a1bede…` (`main` @ `c2301e2`, 9 Nov 05:53 UTC) | same, no new build |
| Auto-deploy | `main` | `main` |
| Variables | 12 names | same 12 names; values never read or written |
| SSL / CDN / cache | active lifetime, redirect on / on / off | same |
| Subdomains / aliases | none | none |
| Database `u339364475_nltag` | `updated_at` 2026-11-02 05:35:18, 3 MB | same |
| DNS | 12 record sets | same 12, plus only the new `staging`, `www.staging`, `ftp.staging` records |
| `main` on GitHub | `c2301e2` | `c2301e2` |

No production migration, no production email, no production admin, no merge, no PR.
