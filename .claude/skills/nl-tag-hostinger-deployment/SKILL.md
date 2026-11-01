---
name: nl-tag-hostinger-deployment
description: Use for NLTAG GitHub and Hostinger Business deployment: runtime, builds, environment variables, domains, DNS/email safety, backups and rollback (Phase 7).
---

# NLTAG Hostinger deployment

## Status
Not authorised. Deployment happens only after Gate 6 (release candidate) and Gate 7 (launch) approvals.

## Facts to re-verify at deployment time
- Hostinger Business Node.js Web App hosting supports Next.js and GitHub deployment; supported Node versions are listed by Hostinger (project pins Node 22.23.4 in `.nvmrc`; `engines` is `>=22.22.2 <23`; select 22.x in hPanel — Hostinger offers 18.x/20.x/22.x/24.x and does not publish the patch; production runtime (`next start`, Next 16.4.3) needs only ≥ 20.9, the 22.22.2 floor comes from dev/test tooling).
- Shared resource limits; ~120s request timeout; no inbound WebSockets; no always-running workers. Use cron/external scheduling.
- Build: `npm ci && npm run build`; start: `npm start`. Never set `NLTAG_DESIGN_SYSTEM_GALLERY` in production.

## Rules
- Zero added recurring cost (Gate 0): no paid add-ons without owner permission.
- Preserve nltagkuwait.com DNS and MX records; no destructive hosting or DNS changes without explicit approval.
- Secrets only in Hostinger environment variables; `.env.example` holds names only.
- Repository: feature branches and PRs; `main` is production; no force-push; ask before changing visibility (the GitHub repo is currently public; the master prompt prefers private).
- Back up before schema changes; keep a rollback path; never claim success until the live domain is tested.

## Checklist
Follow master prompt §18.2 step by step and record each result in `docs/operations/`.
