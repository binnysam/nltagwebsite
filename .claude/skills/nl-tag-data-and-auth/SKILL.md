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

## Never without owner approval
Production database creation or migration, setting SMTP or Google credentials, changing session lengths, roles or the permission matrix, adding a paid service, deploying.
