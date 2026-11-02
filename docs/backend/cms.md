# CMS and admin (Phase 4c)

Status: Phase 4c merged and deployed (2 Nov 2026); migrations `0001` and `0002` applied to production the same day with the owner's approval. Phase 5 public website: see "Public website" below.
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
| `media_asset` | JPEG/PNG/WebP up to 2 MB: type, size, SHA-256, alt text in both languages and `storage_key`; the bytes are a file in the persistent media folder (migration `0002_media_file_storage`) |

All text columns use `utf8mb4_uca1400_ai_ci` (Tamil); ids, slugs and hashes are `ascii_bin`. Foreign keys cascade from `content_item` to its rows; user references are `SET NULL` so content outlives an account. Soft delete on `content_item` and `media_asset`.

**Not in the database:** the regular weekly schedule. It stays the Gate 0 record in `src/content/schedule.ts`; the admin shows it read-only. Only individually announced special meetings are CMS events.

**Media storage — owner decision (2 Nov 2026):** image files live in `/home/u339364475/nltag-data/media`, outside the deployment, Git and `public_html`; verified writable by the Node.js app and persistent across a fresh Hostinger deployment on 2 Nov 2026. Rules, backup and restore: `docs/operations/media-storage.md`.

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
- Uploads: type detected from bytes (no SVG, HTML or PDF), 2 MB, written as private extension-less files outside the deployment (fail closed if the folder is unusable), served only to staff from `/admin/media/<id>` with `nosniff`, `no-store` and a sandbox CSP; a file that no longer matches its SHA-256 is not served.
- Audit rows: ids, action names and status changes only — never titles, text, names or emails. IPs are HMAC'd.
- Redirect results use fixed keys (`?done=publish`, `?error=forbidden`), never text from the URL.
- Concurrency: every save names the version it edited; a stale save is refused with a message.
- `/admin/*` sends `Cache-Control: private, no-store` and `X-Robots-Tag: noindex`; the admin follows the accounts gate (404 while accounts are off).

## Public website (Phase 5, 2 Nov 2026)
Read-only. Pages never select content tables: they call the loaders in `src/server/cms/public-site.ts`, which call `src/server/cms/public.ts`.

| Layer | Does |
|---|---|
| `public.ts` | `listPublished(type, locale)`, `getPublishedPage(slug, locale)`, `listUpcomingSpecialMeetings`, `listPublishedSermons`, `listPublishedMinistries`, `listPublishedTestimonies`, `getDailyVerse(now)`. Published + not deleted in SQL; publish/expiry window, testimony permission and language title checked on every read; DTOs carry public fields only (no author ids, permission records, unapproved contacts, anonymous names, unverified verse text). |
| Cache | Every query (rows, event/sermon/ministry/testimony details, verse candidates and cards) is in the Next.js data cache under `cms:published`, 5 min, **expired at once** by any CMS write that can change public output (publish, unpublish, edits to published items, permissions, verse schedule). The time window is applied *after* the cache, so scheduled and expiring items switch at the right minute. Unverified verse text is removed *before* it enters the cache. |
| `public-site.ts` | `connection()` makes public pages render per request (never prerendered at build, so no stale or build-time data). Each section degrades to its designed empty state if the database is unreachable or not configured, logging `public.content_unavailable` once per section (error name only). Merges Tamil and English special meetings for the cards. |

**Routes** (`src/app/[locale]/`): `/` (homepage), `/about`, `/worship-times`, `/sermons`, `/ministries`, `/testimonies`, `/contact`, and `/{slug}` for any other published page. All `noindex` until the launch gate, with canonical and hreflang (ta, en, x-default → ta) on `https://nltagkuwait.com`.

**Reserved page slugs:** `welcome` — its summary is the homepage hero lead (until published, the approved "website is being prepared" notice); usually *Unlisted*. `about` — the homepage introduction and `/about`. `contact` — under the Gate 0 visit facts (NECK, Friday main worship; never an address) on the homepage and `/contact`.

**What appears where:** homepage = welcome lead → introduction → Gate 0 schedule → up to 3 upcoming special meetings → announcements (hidden when none) → 3 ministries → 3 sermons → 3 testimonies → today's verse → visit and contact → footer. Dedicated pages list everything published. Special meetings leave the site at their end time (start time when no end). Images (ministry, sermon thumbnail) are **not** shown publicly yet: media is served only to staff; a public image route is a separate security decision.

**Bible verse:** no published verse → designed fallback ("Today's verse will be published soon"); published but permission not verified → the approved placeholder text with the published reference; verified → the text and exact credit line of the verified translation only.

## Migrations
- Local / CI: `npm run db:migrate` (CI applies it to MariaDB 11.8.9 on every run).
- Production: **applied 2 Nov 2026** (owner-approved, verified backup first). `0001_cms_content` and `0002_media_file_storage` ran together, once: backup, exact steps, checks and rollback in `docs/operations/production-migration-cms.md`. They only create the CMS tables and insert the two `bible_translation` rows; identity, access and audit tables are untouched.

## Testing
| Command | Covers |
|---|---|
| `npm test` (`tests/unit/cms.test.tsx`, `components.test.tsx`) | workflow × role, visibility, scheduling, daily verse, Kuwait time and Gate 0 occurrences, validation (HTML, links, slugs, locations, URLs), Markdown XSS, new components with axe |
| `npm run test:integration` (`tests/integration/cms.test.ts`) | migration and collation, role isolation, editor/admin boundaries, concurrency, draft/published/deleted/scheduled visibility, testimony permission, ministry contact approval, Bible permission gating, Tamil round trip and search, audit contents, media sniffing, dashboard |
| `E2E_AUTH=1 npx playwright test admin` | real Chrome at 390 and 1280: access (anonymous, member, editor, admin), bilingual editor, server validation, preview, publish/unpublish with dialog, editor submission, every module page with axe WCAG 2.2 AA, 44px targets, no sideways scroll; screenshots in `test-results/admin-screens` |
| `npx playwright test accounts-gate` (accounts off) | `/admin`, previews and media return 404 |
| `tests/integration/public-site.test.ts` (MariaDB) | Phase 5 public reads: announcements never draft/in-review/archived/deleted/future/expired; language titles; meeting order, end-time removal, venues without addresses, bilingual merge; sermon order and fields; unapproved contacts; testimony permission and anonymity; unlisted pages; cache cleared by writes; no private DTO fields |
| `tests/unit/public-site.test.tsx` | EntryList, SiteFooter, SpecialMeetingCard options, empty states, verse permission mapping, formatters, metadata |
| `npx playwright test public-site` | every public route × ta/en at 390 and 1280: axe WCAG 2.2 AA, 44px, no sideways scroll, one h1, noindex, hreflang, only the hero animates, empty states (no database); with `PUBLIC_E2E_SEEDED=1` after `npm run db:seed:public` (CI job `public-browser`): fixtures visible, every hidden fixture absent; screenshots at 390/768/1280 in `test-results/public-screens` |

Local browser setup: `.env.local` with `NLTAG_ACCOUNTS_ENABLED=1`, `BETTER_AUTH_URL=http://localhost:3100` and placeholder `SMTP_*` values pointing at nothing (production builds keep accounts off without them); then `npm run db:migrate && npm run db:seed && npm run db:seed:content && scripts/serve-gallery.sh`.
