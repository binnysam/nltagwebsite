# Hostinger deployment (production)

Site: `https://nltagkuwait.com` · Hostinger Business, account `u339364475`, one website (Node.js web app).

## How production deploys
- **Source:** GitHub `binnysam/nltagwebsite`, branch `main`, through Hostinger's Node.js GitHub integration (the Hostinger GitHub App). Every push to `main` installs, builds and restarts the app. Only one deployment runs at a time; later pushes queue.
- **Not used:** the generic Git tool in the Websites section (clone + webhook, for static/PHP sites). It runs no build.
- **Build settings (stored in Hostinger):** Node.js 22 · framework Next.js · package manager npm · root = document root · build script `build:hostinger` · output `.next`.
- `build:hostinger` (`scripts/hostinger-build.mjs`) runs `next build`. It applies database migrations **only** when `NLTAG_APPROVED_PRODUCTION_MIGRATION=1` is set in the environment for one owner-approved build; the variable is removed afterwards. Normal pushes never migrate.
- A failed build does not replace the running version; the previous version keeps serving.

## Environment (names only; values live in Hostinger, never in Git or chat)
`DATABASE_URL` (MariaDB `u339364475_nltag` on 127.0.0.1:3306) · `BETTER_AUTH_SECRET` · `BETTER_AUTH_URL=https://nltagkuwait.com` · `EMAIL_DAILY_CAP=300` · `NLTAG_ACCOUNTS_ENABLED=0`.
Changing variables restarts the app; Hostinger's replace operation replaces the whole set.

## Accounts
Account pages and `/api/auth` return 404 while `NLTAG_ACCOUNTS_ENABLED=0`. Enabling: `docs/backend/data-and-auth.md`.

## Rollback
- Bad release: revert the commit on `main` (or push a fix); auto-deploy rebuilds. A failed build leaves the previous version live.
- Stop auto-deploy: Hostinger "Disconnect from repository" for this site (or the API `hosting_git_delete-auto-deployment-settings`); the deployed files stay live.

## Must not change during deploys
Domain, HTTPS certificate, nameservers, MX `mx1/mx2.hostinger.com`, SPF, DKIM `hostingermail-a/b/c`, DMARC, `autodiscover`/`autoconfig`, Hostinger email.

## History
- 2 Nov 2026: new site replaced the old trial app (report in the claude.ai project: `NLTAG-PRODUCTION-REPLACEMENT-REPORT.md`). First release deployed from a `git archive` of `main` because Hostinger's GitHub link only reached another account.
- 2 Nov 2026: Hostinger's GitHub connection moved to `binnysam`; auto-deploy from `main` set up and verified with this document's commit.
