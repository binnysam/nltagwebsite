---
name: nl-tag-data-and-auth
description: Use for NLTAG database schema, migrations, Better Auth, sessions, roles, permission checks, audit logging, rate limits and account emails (Phase 4b+).
---

# NLTAG data and authentication

Read `docs/backend/data-and-auth.md` first. It holds the code map, tables, permission matrix and limits.

## Must
- MariaDB 11.8 only (local, CI, production). Connect to `127.0.0.1`.
- Schema change → `npm run db:generate -- --name <change>` → read and, if needed, hand-edit the SQL → commit SQL + schema together. Never `drizzle-kit push`, `introspect` or `pull`.
- Text columns inherit `utf8mb4_uca1400_ai_ci`; ids, tokens and hashes use `asciiBin`/`idColumn` from `src/server/db/columns.ts`.
- MariaDB `JSON` is `LONGTEXT`: parse and validate with Zod in the data layer.
- Every server action/route: `requirePermission(headers, permission)` first; ownership re-checked from the session; never trust client ids or roles.
- Audit sensitive actions with `audit()`; never put names, emails, DOBs, phones, tokens or passwords in audit rows or logs (use `log()`, which redacts).
- Seed and tests use fictional data on the `@nltag.test` domain only.
- Accounts gate (`src/server/accounts-gate.ts`): production needs `NLTAG_ACCOUNTS_ENABLED=1`, all `SMTP_*` and `AUTH_RATE_LIMIT=on`. Never weaken it.
- New users only through the staff allowlist (`src/server/auth/signup-allowlist.ts`, enforced in the `user.create.before` hook). It fails closed in production; keep the refused response identical to a real sign-up.
- Two-factor (Phase 6b): Church Admin permissions require `twoFactorEnabled` (`two-factor-policy.ts` → `permissionsFor`). Never add a path to `SESSION_PATHS_WITH_SECOND_FACTOR` that can create a session without a code; never offer trusted devices or re-show the secret; disable/new codes need password + current code. Never change `BETTER_AUTH_SECRET` after enrollment.
- Client IP: only `resolveClientIp`/`clientIpOf` from `src/server/security/client-ip.ts` (never read `X-Forwarded-For`/`X-Real-IP` yourself, never the leftmost entry). Better Auth reads only the internal `x-nltag-client-ip`, set in `src/proxy.ts` and the auth route and never accepted from clients. Unresolved → shared bucket (fail closed). No guessed proxy ranges. Rules: `docs/backend/client-ip.md`.
- Sign-in protection: never check a password before `reserveAttempt` has counted it (`auth.ts` before hook), and give the reservation back only for non-failures. No hard lockouts: progressive delay (`THROTTLES`), a recognised-browser budget that skips nothing (30 days max, HttpOnly/Secure/SameSite=Strict, owner-approved 3 Nov 2026; do not lengthen without approval), one audit row per address per hour (`claimOncePerWindow`). Rules: `docs/backend/data-and-auth.md` → "Sign-in protection".
- First Church Admin only via `bootstrapFirstAdmin` (requires verified email and two-factor) (`admin:bootstrap` locally, `NLTAG_BOOTSTRAP_ADMIN_EMAIL` in one Hostinger build); owner runbook `docs/operations/admin-activation.md`.

## Never without owner approval
Production database creation or migration (including applying `0003_two_factor`), setting SMTP or Google credentials, enabling accounts, changing the allowlist or bootstrapping an admin, changing which roles require two-factor, changing session lengths, roles or the permission matrix, adding a paid service, deploying.
