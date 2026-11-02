# Hostinger deployment (production)

Site: `https://nltagkuwait.com` · Hostinger Business, account `u339364475`, one website (Node.js web app).

## How production deploys
- **Source:** GitHub `binnysam/nltagwebsite`, branch `main`, through Hostinger's Node.js GitHub integration (the Hostinger GitHub App). Every push to `main` installs, builds and restarts the app. Only one deployment runs at a time; later pushes queue.
- **Not used:** the generic Git tool in the Websites section (clone + webhook, for static/PHP sites). It runs no build.
- **Build settings (stored in Hostinger):** Node.js 22 · framework Next.js · package manager npm · root = document root · build script `build:hostinger` · output `.next`.
- `build:hostinger` (`scripts/hostinger-build.mjs`) runs `next build`. Two owner-approved one-off tasks, each only when its variable is set for one build and removed afterwards (refused together in the same build):
  - `NLTAG_APPROVED_PRODUCTION_MIGRATION=1` — applies the reviewed migrations before the build. Normal pushes never migrate.
  - `NLTAG_BOOTSTRAP_ADMIN_EMAIL=<address>` — after the build, grants the first Church Admin; prints `granted` or `not done: <reason>`, never the address, and never fails the deploy. Runbook: `docs/operations/admin-activation.md`.
- The SMTP Stage A delivery test (`NLTAG_APPROVED_SMTP_TEST`) passed on 2 Nov 2026 and was removed in Phase 6a; the variable now does nothing.
- A failed build does not replace the running version; the previous version keeps serving.

## Environment (names only; values live in Hostinger, never in Git or chat)
`DATABASE_URL` (MariaDB `u339364475_nltag` on 127.0.0.1:3306) · `BETTER_AUTH_SECRET` · `BETTER_AUTH_URL=https://nltagkuwait.com` · `EMAIL_DAILY_CAP=300` · `NLTAG_ACCOUNTS_ENABLED=0` · `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.
Added only at account activation (owner, `docs/operations/admin-activation.md`): `AUTH_RATE_LIMIT=on`, `NLTAG_SIGNUP_ALLOWLIST`; and for one build only `NLTAG_BOOTSTRAP_ADMIN_EMAIL`.
Changing variables restarts the app; Hostinger's replace operation replaces the whole set.

## Persistent data outside the deployment
Uploaded images: `/home/u339364475/nltag-data/media` (survives deploys; verified 2 Nov 2026). Backup and restore with the database: `docs/operations/media-storage.md`. Each start logs `[nltag-media-storage]` in the runtime log.

## Accounts
Account pages and `/api/auth` return 404 while `NLTAG_ACCOUNTS_ENABLED=0`, and in production also unless all `SMTP_*` are set and `AUTH_RATE_LIMIT=on`. Enabling and the first admin: `docs/operations/admin-activation.md`.

## Rollback
- Bad release: revert the commit on `main` (or push a fix); auto-deploy rebuilds. A failed build leaves the previous version live.
- Stop auto-deploy: Hostinger "Disconnect from repository" for this site (or the API `hosting_git_delete-auto-deployment-settings`); the deployed files stay live.

## Must not change during deploys
Domain, HTTPS certificate, nameservers, MX `mx1/mx2.hostinger.com`, SPF, DKIM `hostingermail-a/b/c`, DMARC, `autodiscover`/`autoconfig`, Hostinger email.

## History
- 2 Nov 2026: new site replaced the old trial app (report in the claude.ai project: `NLTAG-PRODUCTION-REPLACEMENT-REPORT.md`). First release deployed from a `git archive` of `main` because Hostinger's GitHub link only reached another account.
- 2 Nov 2026: Hostinger's GitHub connection moved to `binnysam`; auto-deploy from `main` set up and verified with this document's commit.
- 2 Nov 2026: Phase 4c merged (#4, #5); media folder verified across a fresh rebuild. Migrations `0001`/`0002` not applied to production.
