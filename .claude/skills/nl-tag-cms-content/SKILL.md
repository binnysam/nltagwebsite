---
name: nl-tag-cms-content
description: Use for NLTAG content models, bilingual editorial workflow, CMS roles, publishing and content metadata (Phase 4+).
---

# NLTAG CMS and content

## Status
Not implemented. Approved decisions only (Gate 0); infrastructure needs Phase 4 approval (recommended: Hostinger Business MySQL, zero added cost).

## Roles (server-enforced)
| Capability | Church Admin | Content Editor |
|---|---|---|
| Create/edit drafts | Yes | Yes |
| Submit for review | — | Yes |
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
