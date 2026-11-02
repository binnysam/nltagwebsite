# CMS and admin (Phase 4c)

Status: built and tested on branch `phase4c/cms-admin` (2 Nov 2026). Not merged, not deployed. Production migration `0001_cms_content` not applied.
Builds on Phase 4b (`docs/backend/data-and-auth.md`): same MariaDB, Drizzle, Better Auth, roles, permission matrix and audit log. No new service, dependency or environment variable.

## Architecture
```
src/server/db/schema/content.ts  CMS tables (below)
src/server/cms/registry.ts       one entry per module: URL segment, labels, which fields it supports
src/server/cms/rules.ts          pure rules: canPerform (workflow × role), publishBlocker, isPubliclyVisible,
                                 displayStatus, pickDailyVerse — unit-tested exhaustively
src/server/cms/schemas.ts        Zod validation of every write (FormData → typed input), cross-field rules
src/server/cms/service.ts        the only code that writes content; checks permissions itself, audits, transactions
src/server/cms/public.ts         published-content queries for the public site (later phases)
src/server/cms/cache.ts          one cache tag; every write that can change public output expires it
src/lib/markdown.tsx             safe Markdown → React elements (no HTML strings, no dangerouslySetInnerHTML)
src/lib/schedule-occurrences.ts  next dates of the Gate 0 schedule (Kuwait time)
src/app/admin/                   English-first admin (own root layout, lang="en"), server actions in actions.ts
scripts/db/seed-content.ts       fictional, bracketed sample content for local review (npm run db:seed:content)
```
Request path: page or server action → `requireStaffPage` / `actionCtx` (accounts gate, session, roles from the database) → service (permission check again, validation already done by `parseContentForm`) → transaction with audit row.

## Tables (migration `0001_cms_content`, new tables only)
| Table | Purpose |
|---|---|
| `content_item` | one row per item: type, status, slug, visibility, featured, publish/expiry window, first/last published, `version` (optimistic concurrency), created/updated/deleted by and at |
| `content_translation` | (item, `ta`/`en`): title, summary, Markdown body, SEO title/description, editor's state. Languages are independent |
| `event_detail` | special meetings: starts/ends (UTC, entered in Kuwait time), location kind (`NECK`, `MEMBERS_HOMES`, `OTHER`, `TO_BE_ANNOUNCED`), place name for `OTHER` only |
| `sermon_detail` | speaker, Bible reference, date, https video link, thumbnail (media) |
| `ministry_detail` | image (media), public contact line + `contact_approved` |
| `testimony_detail` | display name or anonymous; permission `NOT_RECORDED`/`GRANTED`/`WITHDRAWN` with who/when |
| `bible_translation` | `bsi-ta`, `nkjv-en` (seeded `NOT_VERIFIED`): credit line, permission reference, verified by/at, downloads allowed |
| `verse_detail`, `verse_text` | card variant and preset; reference and text per translation |
| `verse_schedule` | one verse per Kuwait date (`YYYY-MM-DD`) |
| `media_asset` | JPEG/PNG/WebP up to 2 MB, stored as `MEDIUMBLOB` with SHA-256, alt text in both languages |

All text columns use `utf8mb4_uca1400_ai_ci` (Tamil); ids, slugs and hashes are `ascii_bin`. Foreign keys cascade from `content_item` to its rows; user references are `SET NULL` so content outlives an account. Soft delete on `content_item` and `media_asset`.

**Not in the database:** the regular weekly schedule. It stays the Gate 0 record in `src/content/schedule.ts`; the admin shows it read-only. Only individually announced special meetings are CMS events.

**Why images are in the database:** Hostinger's Git deployment replaces the application folder on every deploy, so uploaded files there would be lost; the database is the only persistent storage already provisioned and is covered by its backups. Owner decision requested (see the PR).

## Authorization (enforced in `rules.ts` + `service.ts`; the permission matrix is unchanged)
| Action | Content Editor | Church Admin | Permission used |
|---|---|---|---|
| Open the admin, preview, read lists and media | ✓ | ✓ | `admin.access` |
| Create items; edit Draft and In-review items | ✓ | ✓ | `content.draft.edit` |
| Edit Published or Archived items | — | ✓ | `content.publish` |
| Submit for review (Draft → In review) | ✓ | — | `content.submit_for_review` |
| Publish / schedule, unpublish, archive, return to draft | — | ✓ | `content.publish` |
| Delete (soft) and restore; see deleted items | — | ✓ | `content.publish` |
| Record testimony permission; approve ministry contact; Bible permissions; verse schedule; delete media | — | ✓ | `content.publish` |
| Upload images | ✓ | ✓ | `media.upload` |
| Staff and roles | — | ✓ | `staff.manage` |
| Audit log, admin activity on the dashboard | — | ✓ | `audit.read` |
| Membership data | never in the CMS | | |

Members, visitors and unverified staff: nothing. Denials are audited (`policy.deny`) and return 403 (actions) or 404 (pages).

## Publishing workflow
`Draft → (editor submits) In review → (admin publishes) Published → unpublish → Draft`; `Archived` takes an item off the site and keeps it. "Scheduled" is Published with a future *Publish from*; "Expired" is Published past *Expires*. Delete is a soft delete an admin can restore.

An item is public only when: Published, not deleted, inside its publish/expiry window, the language has a title, and (testimonies) permission is Granted. `isPubliclyVisible` and the SQL in `public.ts` implement the same rule; a MariaDB test checks they agree.

Special rules: a testimony cannot be published without Granted permission, and recording Withdrawn unpublishes it at once. A ministry contact line is public only once a Church Admin approves it; any change by an editor withdraws approval. Bible verse text and credit lines are returned only for translations whose permission is Verified; downloads stay off unless also allowed. Daily verse: the scheduled verse for the Kuwait date, otherwise a deterministic pick (FNV-1a of the date over published verses sorted by id).

## Content safety
- Server-side Zod on every write: NFC normalisation, length limits, no control characters, **no HTML tags** in any field, links only `https:`, `http:`, `mailto:` or `/path`. Video links must be https.
- Rendering: `Markdown` builds React elements; anything that looks like HTML is shown as text. External links get `rel="noopener noreferrer"`.
- Events: members' homes and NECK never carry an address; `OTHER` needs a place name; public queries blank the place unless `OTHER`.
- Uploads: type detected from bytes (no SVG, HTML or PDF), 2 MB, served only to staff from `/admin/media/<id>` with `nosniff`, `no-store` and a sandbox CSP.
- Audit rows: ids, action names and status changes only — never titles, text, names or emails. IPs are HMAC'd.
- Redirect results use fixed keys (`?done=publish`, `?error=forbidden`), never text from the URL.
- Concurrency: every save names the version it edited; a stale save is refused with a message.
- `/admin/*` sends `Cache-Control: private, no-store` and `X-Robots-Tag: noindex`; the admin follows the accounts gate (404 while accounts are off).

## Public integration (for later phases)
`listPublished(type, locale)`, `getPublishedPage(slug, locale)`, `listUpcomingSpecialMeetings`, `listPublishedSermons`, `listPublishedMinistries`, `listPublishedTestimonies`, `getDailyVerse(now)`. DTOs carry public fields only. Cached under `cms:published` (5 min) and expired immediately by any write that touches published content. No public page uses them yet; the homepage is unchanged.

## Migrations
- Local / CI: `npm run db:migrate` (CI applies it to MariaDB 11.8.9 on every run).
- Production: **not run by this PR**. After the owner approves the merge and the migration, set `NLTAG_APPROVED_PRODUCTION_MIGRATION=1` in Hostinger for one build (see `data-and-auth.md`), confirm the build log shows `0001_cms_content` applied, then remove the variable. The migration only creates tables and inserts the two `bible_translation` rows; it does not touch identity, access or audit tables.
- Rollback: the tables are new; dropping them (in reverse foreign-key order) returns the database to the 4b state. Take a Hostinger database backup before applying.

## Testing
| Command | Covers |
|---|---|
| `npm test` (`tests/unit/cms.test.tsx`, `components.test.tsx`) | workflow × role, visibility, scheduling, daily verse, Kuwait time and Gate 0 occurrences, validation (HTML, links, slugs, locations, URLs), Markdown XSS, new components with axe |
| `npm run test:integration` (`tests/integration/cms.test.ts`) | migration and collation, role isolation, editor/admin boundaries, concurrency, draft/published/deleted/scheduled visibility, testimony permission, ministry contact approval, Bible permission gating, Tamil round trip and search, audit contents, media sniffing, dashboard |
| `E2E_AUTH=1 npx playwright test admin` | real Chrome at 390 and 1280: access (anonymous, member, editor, admin), bilingual editor, server validation, preview, publish/unpublish with dialog, editor submission, every module page with axe WCAG 2.2 AA, 44px targets, no sideways scroll; screenshots in `test-results/admin-screens` |
| `npx playwright test accounts-gate` (accounts off) | `/admin`, previews and media return 404 |

Local browser setup: `.env.local` with `NLTAG_ACCOUNTS_ENABLED=1`, `BETTER_AUTH_URL=http://localhost:3100` and placeholder `SMTP_*` values pointing at nothing (production builds keep accounts off without them); then `npm run db:migrate && npm run db:seed && npm run db:seed:content && scripts/serve-gallery.sh`.
