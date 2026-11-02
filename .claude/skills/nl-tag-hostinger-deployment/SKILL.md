---
name: nl-tag-hostinger-deployment
description: Use for NLTAG GitHub and Hostinger Business deployment: runtime, builds, environment variables, domains, DNS/email safety, backups and rollback (Phase 7).
---

# NLTAG Hostinger deployment

## Status
Live since 2 Nov 2026 (owner-approved replacement of the old trial site). Production deploys automatically from `main` via Hostinger's Node.js GitHub integration. Current setup, environment names and rollback: `docs/operations/hostinger-deployment.md`. Pushing to `main` deploys, so `main` changes still go through PRs with green CI.

## Facts to re-verify at deployment time
- Hostinger Business Node.js Web App hosting supports Next.js and GitHub deployment; supported Node versions are listed by Hostinger (project pins Node 22.23.4 in `.nvmrc`; `engines` is `>=22.22.2 <23`; select 22.x in hPanel — Hostinger offers 18.x/20.x/22.x/24.x and does not publish the patch; production runtime (`next start`, Next 16.4.3) needs only ≥ 20.9, the 22.22.2 floor comes from dev/test tooling).
- Shared resource limits; ~120s request timeout; no inbound WebSockets; no always-running workers. Use cron/external scheduling.
- Build script in Hostinger: `build:hostinger` (runs `next build`; migrates only with the one-time approval variable); Hostinger runs the standalone server. Never set `NLTAG_DESIGN_SYSTEM_GALLERY` or `NLTAG_LOCAL_MAIL_OUTBOX` in production.
- Database: MariaDB 11.8.9 at `127.0.0.1:3306`. Migrations are a separate owner-approved step: set `NLTAG_APPROVED_PRODUCTION_MIGRATION=1` for one build, then remove it. Never on boot.
- Environment variables (names in `.env.example`): `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, optional `GOOGLE_CLIENT_ID/SECRET`, `SMTP_*`, `EMAIL_DAILY_CAP`, `TRUSTED_PROXIES`, `NLTAG_ACCOUNTS_ENABLED`, and at account activation `AUTH_RATE_LIMIT=on`, `NLTAG_SIGNUP_ALLOWLIST` and (one build only) `NLTAG_BOOTSTRAP_ADMIN_EMAIL` — `docs/operations/admin-activation.md`.
- Hostinger links one GitHub account per provider per hPanel account (now `binnysam`). Use the Node.js GitHub integration, never the generic Websites → Git clone/webhook tool.

## Rules
- Zero added recurring cost (Gate 0): no paid add-ons without owner permission.
- Preserve nltagkuwait.com DNS and MX records; no destructive hosting or DNS changes without explicit approval.
- Secrets only in Hostinger environment variables; `.env.example` holds names only.
- Repository: feature branches and PRs; `main` is production; no force-push; ask before changing visibility (the GitHub repo is currently public; the master prompt prefers private).
- Back up before schema changes; keep a rollback path; never claim success until the live domain is tested.

## Checklist
Follow master prompt §18.2 step by step and record each result in `docs/operations/`.
