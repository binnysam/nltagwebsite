# Staging setup readiness: report (9 November 2026, overnight)

**Bottom line.** The approved implementation (`2f59f35`) is safe to deploy as a separate Hostinger staging app. Hostinger can host it: the plan is active, the domain's DNS is on Hostinger, Node.js 22 is available, and the GitHub connection already exists. Every local check passed, including a full staging build and browser QA against MariaDB 11.8.9 (production's engine and version). One small hardening gap was found, fixed locally and **not pushed** (§3). Nothing on Hostinger, GitHub or production was changed.

## 1. Current GitHub state (fetched 9 Nov 2026)

| Ref | Commit | Status |
|---|---|---|
| `origin/claude/upbeat-faraday-qh8gmr` (approved) | `2f59f3543b2f46b95ae4b79f1a666e8985a8dd39` | matches the approved commit; 11 commits ahead of `main`, fast-forward (main is an ancestor) |
| `origin/main` (production) | `c2301e2` (PR #24, 5 Nov) | unchanged; it is also what production last built (Hostinger build completed 9 Nov 05:53 UTC) |
| PR #25 | head `claude/adoring-planck-sh413q` @ `0e7ba3c` | does **not** contain migration 0004. The approved branch has **no PR**, so no Hostinger PR preview has been built from it |
| Local only (not pushed) | `claude/elegant-pasteur-es9mnm` = `2f59f35` + 1 commit (mail-folder fix and this report) | waiting for push approval (§10) |

Migrations: `main..2f59f35` only **adds** `0004_forms_gallery` (+ snapshot, + one journal entry). The SQL and journal entries for `0000`–`0003` are untouched, so historical hashes are unchanged.

## 2. Hostinger capabilities: verified read-only through the API

| Item | Finding |
|---|---|
| Plan | `hostinger_business_v3`, order 1009441680, active; account `u339364475` |
| Websites | 1: `nltagkuwait.com` (Node.js). No subdomains, no parked domains, no running setups |
| Staging subdomain | `staging.nltagkuwait.com` is **free**: no DNS record and no website. The DNS zone is on Hostinger |
| Second Node.js app | Supported. `hosting_websites_create` accepts a one-level subdomain (`staging.nltagkuwait.com`) as a **separate website** with its own vhost, Node.js settings, variables and Git deployment. ⚠ Do **not** use "add subdomain to website" (`hosting_websites_add-domain`): that attaches the subdomain to the *production* site |
| Node.js app quota | **Not readable through the API.** The repository's docs say the Business plan allows 5 apps and the API shows 1 Node.js site, but the quota itself is unconfirmed. hPanel shows it when you add the site |
| Node.js versions | 18, 20, 22, 24. Production uses 22 (`app_type next`, script `build:hostinger`, output `.next`, npm, root = document root) |
| GitHub | A Git installation already reaches `binnysam/nltagwebsite` (production's auto-deploy on `main` uses it). Staging can use the same installation with a different branch, so no new GitHub authorisation is needed |
| Environment variables | Per website; the API write is a **full replace**, and values are masked on read. Production has 12 names: `NLTAG_SIGNUP_ALLOWLIST, AUTH_RATE_LIMIT, SMTP_FROM, SMTP_PASS, SMTP_USER, SMTP_PORT, SMTP_HOST, DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, EMAIL_DAILY_CAP, NLTAG_ACCOUNTS_ENABLED`. Values were not read. Production does **not** set `NLTAG_DEPLOYMENT`, `NLTAG_MEDIA_DIR` or either one-off flag (correct) |
| Database | 1 database, `u339364475_nltag` (user `u339364475_nltag`), 3 MB used of a 3072 MB limit. Databases belong to the account, so a second one is created alongside. The app connects to `127.0.0.1:3306`; the `srv2057.hstgr.io` host is for remote access only |
| Media | Same Unix user and home folder for both apps, so isolation comes from the separate folder `/home/u339364475/nltag-data-staging/` plus the code checks (§3) |
| SSL | Production: lifetime SSL active, HTTPS redirect on, Hostinger CDN on, server cache off. A customer subdomain website can get its own certificate (the API refuses SSL only on *free* `hostingersite.com` subdomains) |
| DNS (do not touch) | `@` ALIAS → CDN, `www` CNAME → CDN, MX `mx1/mx2.hostinger.com`, SPF, DMARC `p=none`, Hostinger DKIM ×3, plus `resend._domainkey` and `send` (Amazon SES) records |
| Resources | CPU, RAM and process limits are **not readable** for this plan through the API (metrics exist only for Agency plans). Both apps share the account's limits, and staging builds compete with production builds |
| PR previews | **Not readable through the API.** Which variables and database previews use is still unknown (D1) |

## 3. Staging implementation review (checked against the code, not the docs)

Confirmed in the code and by running it:
- **Explicit staging:** only `NLTAG_DEPLOYMENT=staging` (`environment.ts: deploymentKind`). A staging-looking `BETTER_AUTH_URL` without the variable is refused.
- **Configuration rules** (`deploymentConfigProblems`): database name and user must contain `staging`; the secret needs the `nltag-staging-` prefix and ≥ 48 characters; the media folder must be absolute, name staging and stay outside `<home>/nltag-data`; capture mode refuses any `SMTP_*` and sandbox mode allows only Mailtrap or Ethereal; the production migration flag, production bootstrap flag and `GOOGLE_*` are refused; the allowlist, church inbox and staging admin must be reserved test addresses. Production gets the mirror checks.
- **Live checks** (`verify.ts`): the database must answer `SELECT DATABASE()` with a staging name **and** hold the marker row; an empty database is claimed only by `staging:init`. The media folder's real path must be outside production's and hold the `.nltag-environment` marker.
- **Fail closed at runtime:** `getPool()`, media read/write and mail capture/sandbox all call `assertStagingVerified`. `/api/health` returns 503 until verification passes. These are the only database pool and SMTP transport in `src/`.
- **Migrations:** `db:migrate` refuses staging; `staging:migrate` needs staging, refuses the production flag and verifies the marker first. Production still needs `NLTAG_APPROVED_PRODUCTION_MIGRATION=1`.
- **Build** (`scripts/hostinger-build.mjs`): in staging, the check runs before migrate, seed and `next build`. Production flags stop a staging build.
- **Auth:** the accounts gate in staging needs `AUTH_RATE_LIMIT=on`, not SMTP. The production bootstrap is refused; the staging bootstrap accepts test addresses only. Seeded fixture users have **no password, no role** and an unusable two-factor flag (checked in the database: 0 credential accounts and 0 roles for `admin.a`, `editor.b`, `member.c`, `unverified.d`).
- **Indexing:** `X-Robots-Tag: noindex, nofollow, noarchive` on every proxied response, `robots.txt` `Disallow: /` (404 in production), banner and `[STAGING]` titles, canonical = staging origin.

Findings:
1. **Fixed locally (not pushed):** `NLTAG_STAGING_MAIL_DIR` was not validated. Pointed at `/home/…/nltag-data/media`, staging still passed its checks and would have written captured mail (with set-password links) into production's media folder. Reproduced, then fixed in `environment.ts`: the folder must be absolute, name staging and stay outside the production data folder. Added a unit test; existing tests are unchanged. The approved commit is safe **as long as `NLTAG_STAGING_MAIL_DIR` is not set**, and the checklist below does not set it.
2. Not fixed (low; decision or awareness):
   - The database check is name- and marker-based; it does not inspect the database user's grants. Covered by a manual check in §7 step 5.
   - Verification runs once at start-up. If MariaDB is unavailable at that moment, staging stays at 503 until restarted (fail closed; fix with a restart).
   - Staging is publicly reachable. Noindex and the banner keep it out of search, but a real visitor could still submit a real prayer request to staging (decision Q3).
   - `X-Robots-Tag` is not added to `/_next/static` assets (not pages; `robots.txt` covers them).
   - The docs name a branch `staging`, which does not exist on GitHub. See Q1.

## 4. Environment-variable checklist (staging website only)

Generate secrets on your own computer, paste them only into the **staging** website's variables, and keep them in your password manager. Never copy any value from the production website.

| Variable | Value | Purpose | Who |
|---|---|---|---|
| `NLTAG_DEPLOYMENT` | `staging` | selects staging and every safeguard | Claude may set |
| `DATABASE_URL` | `mysql://u339364475_staging:<DB password, URL-encoded>@127.0.0.1:3306/u339364475_staging` | staging database | **you** (password) |
| `BETTER_AUTH_SECRET` | `nltag-staging-` + `openssl rand -hex 32` | session and token signing | **you generate** |
| `BETTER_AUTH_URL` | `https://staging.nltagkuwait.com` | origin, links, canonical | Claude may set |
| `NLTAG_MEDIA_DIR` | `/home/u339364475/nltag-data-staging/media` | staging images; created 0700 and marked on first check | Claude may set |
| `NLTAG_ACCOUNTS_ENABLED` | `1` | staff accounts on staging (mail captured) | Claude may set |
| `AUTH_RATE_LIMIT` | `on` | required by the accounts gate | Claude may set |
| `NLTAG_SIGNUP_ALLOWLIST` | `admin@nltag.test,editor@nltag.test,prayer@nltag.test` | who may request a staff account; test addresses only | Claude may set |
| `NLTAG_PUBLIC_FORMS` | `1` | prayer, contact, testimony, gallery (needs 0004, which the staging build applies) | Claude may set (see Q3) |
| `NLTAG_DATA_KEY` | `openssl rand -hex 32` | encrypts prayer requests; staging only | **you generate** |
| `NLTAG_CHURCH_INBOX` | `office@nltag.test` | notification address (captured) | Claude may set |
| `EMAIL_DAILY_CAP` | `300` | mail ceiling | Claude may set |
| `NLTAG_STAGING_MIGRATE` | `1` | migrate staging on every build | Claude may set |
| `NLTAG_STAGING_INIT` | `1` on the **first build only**, then delete | claim the new, empty database | Claude may set |
| `NLTAG_STAGING_SEED` | `1` (optional) | fictional `[E2E …]` content | Claude may set |
| `NLTAG_STAGING_BOOTSTRAP_ADMIN_EMAIL` | `admin@nltag.test`, for one build only (§7 step 12) | first staging Church Admin | Claude may set |

**Never set on staging:** `SMTP_*`, `GOOGLE_CLIENT_*`, `NLTAG_APPROVED_PRODUCTION_MIGRATION`, `NLTAG_BOOTSTRAP_ADMIN_EMAIL`, `CLIENT_IP_SOURCE`, `NLTAG_STAGING_MAIL_DIR`. **Never copied from production:** `DATABASE_URL`, `BETTER_AUTH_SECRET`, `SMTP_*`, `NLTAG_SIGNUP_ALLOWLIST`. Staging refuses most of these anyway; don't rely on that.

## 5. Database and media setup

**Database.** hPanel → the **staging** website → Databases → Management → create database `staging` and user `staging` (giving `u339364475_staging` for both) with a new password of 24+ characters. Leave it empty: the first build claims it (`nltag_environment` marker) and applies `0000`–`0004`. Do not grant this user anything on `u339364475_nltag`. Check: phpMyAdmin as the staging user → `SHOW GRANTS FOR CURRENT_USER();` lists only `` `u339364475_staging`.* ``.

**Media.** Nothing to create by hand. The first staging check creates `/home/u339364475/nltag-data-staging/media` (0700) with a `.nltag-environment` file containing `staging`. Captured mail goes to `/home/u339364475/nltag-data-staging/mail-capture/` (files 0600). Do not create symlinks into `nltag-data`; staging resolves real paths and refuses them.

## 6. hPanel instructions (owner, numbered; tick each)

1. **Production preview check (D1, read-only):** production website → GitHub/Git → note whether PR previews are on and which variables they use. Change nothing. Do not open a PR from the approved branch until this is known.
2. **Websites → Add website → Node.js web app**, domain **`staging.nltagkuwait.com`** (an existing domain's subdomain, as its **own** website). Do not add it as a subdomain or alias of `nltagkuwait.com`. If hPanel says the Node.js app limit is reached, stop.
3. **Database:** §5.
4. **Git:** staging website → GitHub deployment → repository `binnysam/nltagwebsite`, branch **`claude/upbeat-faraday-qh8gmr`** (recommended, Q1), auto-deploy on. Build settings: Node.js **22**, framework **Next.js**, npm, root `.`, build script **`build:hostinger`**, output **`.next`**. Start command: Hostinger's default for Next.js (`next start`), the same as production.
5. **Variables:** §4, including `NLTAG_STAGING_INIT=1`. Save, but don't deploy until step 6 is done.
6. **SSL:** staging website → Security → SSL → install for `staging.nltagkuwait.com`, then turn the HTTPS redirect on. DNS: Hostinger creates the subdomain record. Don't edit `@`, `www`, MX, SPF, DKIM, DMARC, `resend._domainkey` or `send`.
7. **Deploy**, then continue with the procedure in §7.

## 7. Deployment procedure and isolation proof

Before you start: note production's `__drizzle_migrations` row count (phpMyAdmin, `u339364475_nltag`) and the number of files in `/home/u339364475/nltag-data/media`.

1. Create the website (§6.2) and wait until its setup shows completed.
2. Confirm in the DNS zone that `staging` points to Hostinger and that `@` and `www` are unchanged.
3. Create the database (§5).
4. Enter the variables (§4).
5. Run `SHOW GRANTS` as the staging user: only the staging database may appear.
6. Connect Git (§6.4) and deploy. The build log must show, in this order: `Staging build: checking…` → `Staging check passed: configuration, database (name and marker), media folder (marker).` → `Staging database verified (name and marker).` → `Migrations applied.` → `next build`. `Staging check failed: <rule>` names the variable to fix.
7. The build commit shown in hPanel must be `2f59f35` (or the commit you approved in Q2).
8. Remove `NLTAG_STAGING_INIT`. Keep `NLTAG_STAGING_MIGRATE=1`. Redeploy once and expect the same log without the init step.
9. Install SSL and turn on the redirect (§6.6).
10. Verify the domain: `https://staging.nltagkuwait.com/api/health` → `{"status":"ok","deployment":"staging","database":true,"stagingVerified":true}`. On `/ta` the STAGING banner is visible and the tab title starts with `[STAGING]`. `/robots.txt` → `Disallow: /`. Response headers include `x-robots-tag: noindex`. The certificate is valid and `http://` redirects to `https://`.
11. **Isolation proof:**
    - production `__drizzle_migrations` count unchanged, with no `nltag_environment` table;
    - production media file count unchanged;
    - `nltag-data-staging/media/.nltag-environment` says `staging`;
    - staging's variable list has no `SMTP_*`;
    - submitting the staging contact form creates a file in `nltag-data-staging/mail-capture/` with a `[STAGING]` subject, addressed to `office@nltag.test`, and nothing arrives in any real inbox;
    - `https://nltagkuwait.com/api/health` still reports `"deployment":"production"`.
12. **Staff accounts (fictional):** request `admin@nltag.test` on `/en/sign-up` → File Manager → newest file in `mail-capture` → open the set-password link → set a password → enrol two-factor. Add `NLTAG_STAGING_BOOTSTRAP_ADMIN_EMAIL=admin@nltag.test`, redeploy, read `Admin bootstrap: …granted` in the log, then delete the variable. Grant `editor@` and `prayer@` in Admin → Staff and roles.
13. **Staging QA:** repeat the browser checks of `tests/e2e/staging.spec.ts` on the live staging site (public pages at 390 px and 1280 px, forms, inboxes by role, gallery publish/unpublish, captured mail). The automated suite reads captured mail from local disk, so on Hostinger the mail steps are done by hand through File Manager.

Rollback for staging alone: disable its auto-deploy or delete the staging website and the `u339364475_staging` database. Production is not involved.

## 8. Tests executed tonight (this container, MariaDB 11.8.9 in Docker)

| Check | Code | Result |
|---|---|---|
| `npm run verify` (token audit, Tamil record, lint, typecheck, unit, build) | approved `2f59f35` | **pass**, 377 unit tests |
| `npm run test:integration` incl. production-config pass, with `TEST_STAGING_DATABASE_URL` set (the staging claim block ran: 5/5) | approved `2f59f35` | **pass**, 286 + 6 |
| Staging build simulation (`build:hostinger`, staging variables): claim → migrate (0000–0004) → seed → `next build`; second build without init | approved | **pass**; migration table 5 rows, marker `staging` |
| Refusal cases through the real build script: non-staging database/user; production-style secret; Gmail SMTP; production migration flag; media folder inside `<home>/nltag-data`; unclaimed empty database; `db:migrate` on staging | approved | **all refused, exit 1** |
| Runtime: health, `X-Robots-Tag`, `robots.txt` | approved | **pass** (`stagingVerified: true`) |
| Browser `tests/e2e/staging.spec.ts` (Chromium 1243, phone 390 and desktop 1280) | approved | **38 passed, 4 skipped** (staff flow is desktop-only by design). The first two attempts failed on my test setup: the local allowlist didn't contain the suite's `*.qa@nltag.test` addresses, then a stale server held the port. Fixed by correcting my local setup; no code changed |
| `npm run verify` after the fix | local commit | **pass**, 378 unit tests (1 new) |
| `npm run test:integration` after the fix (same staging database setup) | local commit | **pass**, 286 + 6 |

Not run tonight: `public-site`, `admin`, `two-factor`, `design-system`/`hero` browser suites. They need the gallery build on port 3100; the 9 Nov completion report has their results, and they don't touch staging behaviour.

## 9. Remaining blockers

1. Hostinger's Node.js app quota and the PR-preview variables are not readable through the API; they need hPanel (§6.1, §6.2).
2. Owner-generated secrets: database password, `BETTER_AUTH_SECRET`, `NLTAG_DATA_KEY`.
3. The local fix and this report are not on GitHub until you approve a push (Q2).
4. 55 new Tamil strings remain `draft-review`. Fine on staging; they block production only.

## 10. Actions requiring your approval

- **Q1, staging branch.** Connect the staging app directly to `claude/upbeat-faraday-qh8gmr` (recommended: it already exists, so nothing is pushed). Or approve pushing a `staging` branch, as the docs propose.
- **Q2, push.** Approve pushing `claude/elegant-pasteur-es9mnm` (the approved commit + the mail-folder fix + this report). Or keep staging on `2f59f35` exactly and leave `NLTAG_STAGING_MAIL_DIR` unset.
- **Q3, public forms on staging.** `NLTAG_PUBLIC_FORMS=1` lets anyone who finds the staging URL submit a real prayer request into staging. Options: keep it (recommended for QA, with the banner), or set it only during QA sessions.
- **Q4, who performs hPanel.** You follow §6 by hand. Or approve me to do §6.2–§6.6 through the Hostinger connector (create website, database, variables, Git, SSL), with you entering the three secrets yourself.
- **Q5, D1 preview check** (§6.1) before any PR is opened from the approved branch.
