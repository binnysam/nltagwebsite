# Phase 4b — Data and authentication foundation: completion report

**Date:** 2 November 2026 · **Status:** complete locally, awaiting owner review · **Builds on:** Phase 4 architecture (approved with adjustments) and Phase 4a infrastructure report (approved 1 Nov 2026)
**Branch:** `phase4b/data-auth-foundation` (one commit on top of `phase3/hero-motion`). **Not pushed** — this session has read-only access to `binnysam/nltagwebsite`. The commit is attached as a patch (`git am nltag-phase4b.patch`) and a git bundle.

**Not done, as instructed:** no production database or migration, no Hostinger deployment or setting change, no DNS/MX/email change, no paid service, no real personal data, no SMTP or Google credentials requested or stored, no CMS or membership interface, no change to the old live site.

---

## 1. What was delivered

| # | Requested | Delivered |
|---|---|---|
| 1 | MariaDB schema and Drizzle configuration | `src/server/db/schema/*` (8 tables), `drizzle.config.ts`, pool on `127.0.0.1`, UTC session time zone |
| 2 | Versioned SQL migrations | `drizzle/0000_identity_access_audit.sql`, generated then reviewed by hand (sets `utf8mb4_uca1400_ai_ci` before any table). `npm run db:migrate`; production needs an explicit approval flag. No `push`/`introspect` (a test enforces it). |
| 3 | Better Auth integration | `src/server/auth/auth.ts`, route `/api/auth/*`, Drizzle adapter (`mysql` provider) |
| 4 | Email/password registration and sign-in | Minimum 10 characters, scrypt hashes, sign-in blocked until email verified |
| 5 | Email verification and password reset | 24-hour verification links, 1-hour single-use reset links, reset ends all sessions. Bilingual templates (Tamil first). Gmail SMTP transport built; **no credentials**. Locally, emails go to `.data/mail/`. |
| 6 | Optional Google OAuth | Off until `GOOGLE_CLIENT_ID/SECRET` are set; scopes `openid email profile`; cannot attach to an unverified local account; never grants membership or roles |
| 7 | Church Admin and Content Editor roles | `staff_role`; first admin only via `npm run admin:bootstrap` (once, verified account); no self-changes; last admin cannot be removed |
| 8 | Server-side authorization and policies | Permission matrix (`src/server/policy/permissions.ts`, architecture §5), `requirePermission()` on the server, roles read from the database on every request, denials audited |
| 9 | Session management | Database sessions, `nltag.*` HttpOnly SameSite=Lax cookies (Secure in production), 7 days for members, 12 hours for staff, list/revoke other devices, no cookie cache so revocation is immediate |
| 10 | Audit logging and rate limiting | `audit_log` (ids, action, outcome, HMAC'd IP; no names, emails or tokens). Limits: sign-in 5/15 min, sign-up 5/h, verify and reset 3/h per client; 3 emails/h per address; 300 emails per rolling 24 h |
| 11 | Fictional seed data | 4 accounts on the reserved `@nltag.test` domain (Test Admin A, Test Editor B, Test Member C, Test Unverified D). Refuses production or a non-local database. |
| 12 | Automated tests | 18 new unit, 41 MariaDB integration/security, 10 browser tests (below) |

Also added: account pages built only from design-system components (`/[locale]/sign-in`, `sign-up`, `forgot-password`, `reset-password`, `verify-email`, `account`), all `noindex` and `Cache-Control: private, no-store`; GitHub Actions CI on `mariadb:11.8`; `docs/backend/data-and-auth.md`; new skill `nl-tag-data-and-auth`; updated `CLAUDE.md` and four skills.

## 2. Verification

| Check | Result |
|---|---|
| `npm run verify` (token audit, Tamil record, lint, typecheck, unit tests, production build) | ✅ pass — 62 unit tests (44 existing + 18 new) |
| Production build with **no secrets present** | ✅ builds; auth only initialises on first request |
| `npm run test:integration` (real MariaDB) | ✅ 41/41 |
| Browser tests, existing suite (390 px + 1280 px) | ✅ 87 passed |
| Browser tests, account pages (`E2E_AUTH=1`, 390 + 1280) | ✅ 10/10: axe WCAG 2.2 AA, 44 px targets, no horizontal scroll, `noindex`/`no-store` headers, full sign-up → email link → account → sign-out, Tamil forgot-password |
| `npm audit --omit=dev --audit-level=high` | ✅ 0 critical/high. 4 moderate, all from `drizzle-kit`'s old esbuild (a dev tool Better Auth lists as a peer; never runs on the server) |

**Security tests that pass:**
- Same response for registered and unregistered addresses (sign-up, reset); one account per email regardless of letter case.
- Verification/reset tokens never stored as sent; reset token works once.
- CSRF: cookie-carrying requests from another origin or with no origin are refused; cross-site sign-in refused; foreign redirect targets refused.
  *Finding:* the first CSRF test failed because Better Auth silently switches origin/CSRF checks off when `NODE_ENV=test`. They are now forced on in every environment, so the tests check the real behaviour.
- Sign-in rate limit returns 429 on the 6th attempt; a 4th and 5th reset email to one address are suppressed and audited.
- Member, Editor and Admin each get exactly their permissions; Editor is refused publish, membership, users and audit; roles claimed in headers or cookies are ignored; a revoked role stops working on the next request.
- Staff session older than 12 h is ended; a member session of the same age is kept.
- Audit table contains no `@`, no raw IP, no tokens.
- Every table and Unicode column uses `utf8mb4_uca1400_ai_ci`; ids/tokens/hashes use `ascii_bin`; Tamil round-trips byte for byte.

## 3. Deviations and limits you should know

1. **Local engine was MariaDB 10.11, not 11.8.** This sandbox blocks Docker Hub and MariaDB's download mirrors, so I installed Ubuntu's MariaDB 10.11.14 (same `utf8mb4_uca1400_ai_ci` collation, same InnoDB behaviour for what 4b uses). CI runs on `mariadb:11.8` and a test fails there if the version is not 11.8 — **the first CI run is the 11.8 confirmation.** On your Mac, use `docker run mariadb:11.8` (steps in `docs/backend/data-and-auth.md`).
2. **Membership and content tables are not in this migration.** Architecture §11 puts them in 4c and 4d; each phase adds its own reviewed migration. The MariaDB items from 4a (generated column + unique index, `SELECT … FOR UPDATE` counter, JSON as `LONGTEXT` + Zod) are applied there.
3. **Email not tested end to end.** By design until the App Password exists. Code path is covered with an in-memory transport; one real send is the first step of the email test.
4. **Client IP behind Hostinger's proxy is unconfirmed.** Rate limits use `X-Forwarded-For`; `TRUSTED_PROXIES` must be set from a staging check, or limits could key on the proxy address.
5. **39 new Tamil strings are `draft-review`** (sign-in, account, email wording). They are listed in `docs/content/tamil-content-review.md` ("48 of 87 approved"). The approved 48 are unchanged and still tested character for character.

## 4. Decisions for you

| # | Decision | Recommendation |
|---|---|---|
| 4b-1 | Approve Phase 4b and how the code reaches GitHub | Give this session push access to `binnysam/nltagwebsite` (I open a PR from `phase4b/data-auth-foundation`), or apply the attached patch yourself |
| 4b-2 | Tamil wording for the 39 account/email strings | Review in the Tamil sheet; edit freely |
| 4b-3 | Who runs `admin:bootstrap` for the first Church Admin, and with which church account | A church-controlled address, at staging |
| 4b-4 | Gmail App Password timing | When you're ready for the email test (needs 2-Step Verification on `newlifetamilassembly@gmail.com`) |
| 4b-5 | Google sign-in client owner (D3) | Church Google account; until then the button stays hidden |
| 4b-6 | Old live site | See the separate remediation checklist — **Option A (15.3.6) from 4a is withdrawn as insufficient** |

## 5. Next: Phase 4c (CMS), after your approval

Admin shell from design-system components, content tables and migration, Tamil/English editing, draft → review → publish workflow, preview, media upload outside the deploy folder, revisions.
