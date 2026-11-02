# Data and authentication foundation (Phase 4b)

Status: built and tested locally on 2 Nov 2026. Not deployed. No production database exists.
Design source: Phase 4 architecture (approved with adjustments) and the Phase 4a infrastructure report.

## Stack
| Concern | Choice |
|---|---|
| Database | MariaDB 11.8 (Hostinger Business). App connects to `127.0.0.1:3306`, never `localhost`. |
| Data access | Drizzle ORM 0.45 + `mysql2`, pool of 5, session time zone UTC |
| Migrations | `drizzle-kit generate` → reviewed SQL in `drizzle/` → `npm run db:migrate`. Never `push`/`introspect`. |
| Auth | Better Auth 1.7 (self-hosted, tables in our database) |
| Email | `nodemailer` over Gmail SMTP with an App Password (not configured yet) |
| Validation | Zod (environment now; forms in 4c/4d) |

## Code map
```
src/server/                 server-only (import "server-only"); never reaches the browser
  env.ts                    lazy, validated environment (names only in errors)
  db/columns.ts             ascii_bin ids/tokens, datetime(3)
  db/schema/auth.ts         user, session, account, verification, rate_limit (Better Auth)
  db/schema/access.ts       staff_role, audit_log, rate_limit_bucket
  db/client.ts              pool + Drizzle
  auth/auth.ts              Better Auth configuration (getAuth())
  auth/session.ts           getCurrentUser, requireUser, requirePermission, AuthzError
  policy/permissions.ts     permission matrix (pure data), can(), session lengths
  services/roles.ts         bootstrapFirstAdmin, grantRole, revokeRole
  services/audit.ts         audit(), action names
  services/rate-limit.ts    consume() fixed-window counters
  email/templates.ts        bilingual verify/reset emails (Tamil first)
  email/transport.ts        smtp | dev outbox (.data/mail) | memory (tests)
  email/send.ts             per-address and 24-hour caps, background send
  security/hash.ts          HMAC of IPs and emails
  security/log.ts           redacting JSON logger
src/app/api/auth/[...all]   Better Auth HTTP handler
src/app/[locale]/(account)  sign-in, sign-up, forgot/reset password, verify-email, account
src/server/cms/             CMS rules, validation, services, public queries (Phase 4c, docs/backend/cms.md)
src/app/admin/              CMS admin (English-first, staff only, follows the accounts gate)
scripts/db/                 migrate, seed (fictional), create-first-admin
drizzle/                    versioned SQL migrations + meta
```

## Tables (migration 0000_identity_access_audit)
| Table | Purpose | Notes |
|---|---|---|
| `user` | account | email unique, case-insensitive (Unicode collation) |
| `session` | DB sessions | token `ascii_bin` unique; 7 days; staff ended after 12 h |
| `account` | password hash (scrypt) or Google link | OAuth tokens encrypted at rest |
| `verification` | reset tokens | identifiers stored hashed |
| `rate_limit` | Better Auth counters | per IP + path |
| `staff_role` | `CHURCH_ADMIN` / `CONTENT_EDITOR` | unique (user, role) |
| `audit_log` | append-only trail | ids, action, outcome, HMAC'd IP; no names/emails/tokens |
| `rate_limit_bucket` | our counters | email per address, 24-hour mail cap |

Database default and every table: `utf8mb4` / `utf8mb4_uca1400_ai_ci` (Tamil). Ids, tokens and hashes: `ascii_bin` (case-sensitive).

**Content tables (Phase 4c, migration `0001_cms_content`):** `content_item`, `content_translation`, `event_detail`, `sermon_detail`, `ministry_detail`, `testimony_detail`, `bible_translation`, `verse_detail`, `verse_text`, `verse_schedule`, `media_asset`. Details, workflow and the CMS authorization table: `docs/backend/cms.md`. Membership tables arrive with their own migration in 4d.

## Rules for every protected action
1. `const me = await requirePermission(await headers(), "<permission>")` first. 401 if signed out, 403 if not allowed (or 404 with `hideAs404` where existence must not leak). Denials are audited.
2. Roles come from `staff_role` on every request; nothing from cookies or the client.
3. Ids from the client are lookup keys only; re-check ownership against `me.userId`.
4. Write an `audit()` row for anything an admin would need to account for. Never put personal data in it.
5. New permissions are denied to everyone until added to `src/server/policy/permissions.ts` (and its test).
6. CMS writes go through `src/server/cms/service.ts`, which checks permissions itself and applies the workflow rules in `src/server/cms/rules.ts` (Phase 4c used the existing permissions; the matrix is unchanged).

## Permissions
| Permission | Visitor | Member | Content Editor | Church Admin |
|---|---|---|---|---|
| content.read_published | ✓ | ✓ | ✓ | ✓ |
| account.manage_own, membership.own | | ✓ | ✓ | ✓ |
| admin.access, content.draft.edit, media.upload | | | ✓ | ✓ |
| content.submit_for_review | | | ✓ | |
| content.publish | | | | ✓ |
| membership.read_any/decide/birthdays/reports/export | | | | ✓ |
| staff.manage, audit.read | | | | ✓ |

An unverified email removes every permission except reading published content and managing one's own account.

## Limits
| What | Limit | Where |
|---|---|---|
| Sign-in | 5 / 15 min per client | Better Auth |
| Sign-up | 5 / hour per client | Better Auth |
| Verification email request | 3 / hour per client | Better Auth |
| Password reset request | 3 / hour per client | Better Auth |
| Account emails to one address | 3 / hour per kind | `email/send.ts` |
| All outgoing mail | 300 per rolling 24 h (`EMAIL_DAILY_CAP`) | `email/send.ts` |

## Production migrations on Hostinger
There is no SSH step in the deployment, so Hostinger builds use `npm run build:hostinger` (`scripts/hostinger-build.mjs`). It runs `next build`, and only when `NLTAG_APPROVED_PRODUCTION_MIGRATION=1` is set in the Hostinger environment it first applies the reviewed `drizzle/*.sql` to `DATABASE_URL` (127.0.0.1). Set that variable for one owner-approved build, then remove it. Migrations already applied are skipped (drizzle journal). The same script runs the one-time first-admin bootstrap (`NLTAG_BOOTSTRAP_ADMIN_EMAIL`, below); the two are refused in one build.

## Accounts gate (owner decision, 2 Nov 2026)
All account pages (`/ta|en/sign-in`, `sign-up`, `forgot-password`, `reset-password`, `verify-email`, `account`) and `/api/auth/*` return **404** until email delivery works. Code: `src/server/accounts-gate.ts`, used by `src/app/[locale]/(account)/layout.tsx` and `src/app/api/auth/[...all]/route.ts`. Read per request (no rebuild baked in). Nothing on the site links to these pages.

- Off by default everywhere. On only when `NLTAG_ACCOUNTS_ENABLED=1` (exact value).
- In production the flag is ignored unless `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` and `SMTP_FROM` are all set **and** `AUTH_RATE_LIMIT` is explicitly `on` (Phase 6a). The limiter itself defaults to on and production refuses `off`; the gate additionally refuses to rely on the default.
- Tests: `tests/unit/accounts-gate.test.ts`, `tests/e2e/accounts-gate.spec.ts` (every page in both languages, the auth API, no links from the homepage).

### Staff-only sign-up allowlist (Phase 6a)
`NLTAG_SIGNUP_ALLOWLIST` (comma-separated, case-insensitive) lists the addresses that may create an account; membership (Phase 4d) is not authorised, so only staff need accounts. Code: `src/server/auth/signup-allowlist.ts`, enforced in the `user.create.before` database hook in `auth.ts`, so it covers every sign-up method (email and, if ever configured, Google).
- An unlisted address gets Better Auth's generic "already registered" response (status, body shape and password hashing identical to a real sign-up), no row and no email. The form shows the usual "check your email".
- Fail closed: in production an unset/blank list means **nobody** can sign up, and a list with any entry that is not an email address refuses everyone (warning logged once, by variable name only). Outside production an empty list leaves sign-up open for development and tests.
- Sign-in, verification and password reset for existing accounts are not affected. Removing someone from the list does not delete or disable their account; roles are managed in `/admin`.

### First Church Admin (Phase 6a)
`NLTAG_BOOTSTRAP_ADMIN_EMAIL`, set for one Hostinger build, makes the build run `npm run admin:bootstrap:env` after `next build` (`src/server/services/env-bootstrap.ts`). It grants nothing unless: one valid address; the accounts gate is open; the address is on `NLTAG_SIGNUP_ALLOWLIST`; the account exists and is verified; and no Church Admin exists (row lock). It writes the required `role.bootstrap` audit row, prints one line (`granted` / `not done: <reason>`, never the address or id) and never fails the deploy. Locally, `npm run admin:bootstrap -- <email>` does the same grant directly.

### Enabling accounts (owner-approved activation window)
Step-by-step runbook: `docs/operations/admin-activation.md`. SMTP delivery was tested on 2 Nov 2026 (Stage A, since removed).

## Security behaviour (all covered by tests)
- Same response for registered and unregistered addresses (sign-up and reset); emails are sent in the background so timing does not reveal accounts.
- Origin and CSRF checks forced on in every environment (Better Auth disables them under `NODE_ENV=test` by default).
- Cookies `nltag.*`, HttpOnly, SameSite=Lax, Secure in production. No cookie cache, so revoking a session or role takes effect immediately.
- Password reset revokes all sessions; reset tokens are single use, 1 hour; verification links 24 hours.
- Google sign-in is off until `GOOGLE_CLIENT_ID/SECRET` are set; it cannot be linked to an unverified local account, and it never grants membership or roles.
- Production refuses to start sending mail without SMTP; the dev outbox works only in development, or in a local production build with `NLTAG_LOCAL_MAIL_OUTBOX=1` and a localhost URL.

## Commands
```
npm run db:migrate              apply drizzle/*.sql to DATABASE_URL (.env.local)
npm run db:seed                 fictional @nltag.test accounts (refuses production / non-local DB)
npm run db:seed:content         fictional, bracketed sample CMS content (same refusals)
npm run admin:bootstrap -- <email>   first Church Admin only (verified account, once)
npm run admin:bootstrap:env     same, from NLTAG_BOOTSTRAP_ADMIN_EMAIL (Hostinger build only)
npm run db:generate -- --name <change>   new migration from schema changes; review the SQL
npm run test:integration        MariaDB-backed tests (TEST_DATABASE_URL, *_test database)
```

## Local setup
1. MariaDB 11.8 (Docker `mariadb:11.8`, or a local install). Create `nltag_dev` and `nltag_test` with `CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci` and a user for both.
2. Copy `.env.example` to `.env.local`; set `DATABASE_URL` and a random `BETTER_AUTH_SECRET` (`openssl rand -base64 48`).
3. `npm run db:migrate && npm run db:seed`, then `npm run dev`. Emails appear in `.data/mail/`.

## Open items
- Two-factor authentication for Church Admin: owner decision deferred (would add migration `0003_two_factor`).
- Google OAuth client (D3): church-owned Google Cloud project; until then the button is hidden.
- `TRUSTED_PROXIES`: confirm Hostinger's proxy chain on staging so rate limits key on the real client IP.
- Tamil wording for the 39 new account/email strings is `draft-review`.
