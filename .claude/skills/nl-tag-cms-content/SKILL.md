---
name: nl-tag-cms-content
description: Use for NLTAG content models, bilingual editorial workflow, CMS roles, publishing and content metadata (Phase 4+).
---

# NLTAG CMS and content

## Status
Phase 4c built (branch `phase4c/cms-admin`, 2 Nov 2026). Read `docs/backend/cms.md` (architecture, tables, authorization, workflow) and `docs/content/admin-guide.md` (how staff use it).

## Patterns to reuse
- New content type: add it to `CONTENT_TYPES` and a `*_detail` table (new reviewed migration), a `MODULES` entry in `src/server/cms/registry.ts`, a detail schema in `schemas.ts`, `loadDetail`/`writeDetail` cases in `service.ts`, a `TypeDetails` case in the admin form, a public query in `public.ts`, and tests in `tests/unit/cms.test.tsx` and `tests/integration/cms.test.ts`.
- Every write: `parseContentForm` (Zod) → service (permission + `canPerform` + transaction + `audit()`), never direct table writes from routes.
- Public reads only through `src/server/cms/public.ts` (published, in window, language has a title, public DTO fields). Never select content tables in a page.
- Text is Markdown; render with `<Markdown>`; never `dangerouslySetInnerHTML`.
- Admin UI: `requireStaffPage(permission)` first in every page, `actionCtx()` in every action; redirect results use fixed keys (`ResultNotice`); destructive actions use `ConfirmButton`; client forms submit with `keepValues` so errors never wipe input.

## Roles (server-enforced)
| Capability | Church Admin | Content Editor |
|---|---|---|
| Create/edit drafts | Yes | Yes |
| Submit for review | — | Yes |
| Edit published items, delete/restore, record testimony/Bible permissions | Yes | No |
| Publish/unpublish | Yes | No |
| Membership records | Yes | No access |
| Users and roles | Yes | No |

## Content rules
- Translatable records: stable ID, locale, translation status, slug, title/body, SEO title/description, state (Draft, In review, Scheduled, Published, Archived), author/editor, timestamps.
- Schedule facts come from the confirmed Gate 0 schedule; special meetings are CMS records with date, start/end time, location and Tamil + English announcement.
- Bible verses: stable ID, reference, text and translation label per language, theme preset, scheduled date (Asia/Kuwait), publisher credit, status. No verse text until reproduction permission is documented.
- Never fabricate pastor names, history, beliefs, events, testimonies, contacts or social accounts. Missing → `CONTENT REQUIRED`, unpublished.
- Interface wording lives in `src/content/ui-strings.ts`; the 48 reviewed Tamil items were approved on 1 Nov 2026 (approval record: `docs/content/tamil-content-review.md`, regenerate with `node scripts/tamil-review.ts`). Owner-supplied Tamil in `src/content/tamil-approvals.ts` is reproduced exactly. New Tamil starts as `draft-review`.

## Escalate
Choice of CMS/database/storage/email provider, any paid service, role changes, and publishing anything before Church Admin approval.
