# Church Family Directory: architecture (plan only; not implemented, not activated)

**Status:** design for owner review (Nov 2026). No tables, migrations, APIs, routes, roles or registration flows exist or may be created without separate owner approval. It supersedes the Gate 0 self-service membership model (roadmap D2, to be confirmed).

## Purpose and scope

A simple staff-maintained register of the church's families and the people in them, with birthdays and baptism records. Not a CRM: no applications, no member accounts, no workflow statuses.

**In scope:** individual records · family records · full name · date of birth · baptism status and date · birthday reminders shown to staff (and wishes, drafted by staff) · adding a newborn to an existing family · moving or linking a person into a new family after marriage · family composition changes · staff viewing and updating relationships · archiving or removing records.

**Excluded:** public member directory · ministry or group assignments · attendance · member announcements · membership status and history · member reports and exports · member self-service accounts or registration · addresses (unless decided later, D17) · gender, civil ID, photos, occupation, giving.

## Core principle: a person exists once

A **person** has an identity independent of any family. Families are linked to people through **membership periods**. Marriage, relocation or a family change ends one period and starts another; the person row is never copied, so there are no duplicates and the history stays complete.

```
person (1) ──< family_membership >── (1) family
              from_date … to_date (NULL = current)
              relationship, end_reason
```

## Data model (proposed SQL is written only after approval; numbering after migration 0004)

**`person`** — `id` (UUID) · `full_name` · `birth_day`, `birth_month`, `birth_year` (year optional) · `baptism_status` (`BAPTIZED` / `NOT_BAPTIZED` / `UNKNOWN`) · `baptism_date` (only when baptized) · `phone`, `email` (optional, adults only) · `status` (`ACTIVE` / `ARCHIVED`) · `archived_reason` (Moved away / Left / Deceased / Other) · `archived_at/by` · `created/updated_at/by` · `version` (optimistic concurrency).

**`family`** — `id` · `household_name` ("Samuel family") · `status` · `archived_reason/at/by` · optional household `phone`/`email` · `notes` (restricted; encrypted with the data key) · audit columns · `version`.

**`family_membership`** — `id` · `family_id` · `person_id` · `relationship` (`HEAD`, `SPOUSE`, `CHILD`, `PARENT`, `SIBLING`, `GRANDCHILD`, `RELATIVE`, `OTHER`) · `is_primary_contact` · `from_date` · `to_date` · `end_reason` (`MARRIED`, `MOVED_FAMILY`, `SEPARATED`, `ARCHIVED`, `CORRECTION`) · `created_at/by`.
- One **current** family per person: unique index on (`person_id`, generated `is_current` = 1 when `to_date` IS NULL, else NULL). MariaDB has no partial indexes; NULLs never collide.
- One primary contact per family, enforced in the service.

## Workflows (each a guided form with a "what will change" summary, all in one transaction)

| Case | Effect |
|---|---|
| Newborn | New person + current membership (`CHILD`) in the chosen family |
| Marriage, new household | Both people's current memberships end (`MARRIED`); new family; both join as `HEAD`/`SPOUSE`; same person rows |
| Joining a spouse's family | Current membership ends (`MOVED_FAMILY`); new membership in the existing family |
| Family split / composition change | Selected members move to a new family (`SEPARATED`); the original family keeps the rest |
| Person leaves or dies | Person archived with a reason; hidden from lists and birthdays; history kept |
| Correction or erasure request | Church Admin deletes permanently after typing the name; audit keeps ids only |
| Family inactive | Family archived; current members archived or moved first (the dialog lists them) |

## Birthdays (Asia/Kuwait)

Staff dashboard card: today and the next 7 days (name, family, age only when the year is known). Birthday page: this month, month picker, next 30 days, print view (screen print only, no file export). 29 February shows on 28 February in non-leap years (D18). Archived people are excluded. **No automatic emails or messages**; any wish is sent by staff themselves (automation needs separate approval).

## Access, privacy and audit

- New role **Directory Keeper** (two-factor required); Church Admin also has every directory permission; only Church Admin deletes permanently. Content Editors, Prayer Team and visitors get 404.
- No public route, API or search ever reads directory tables: enforced by a test like the existing table-boundary test in `tests/unit/forms.test.ts`.
- Audit rows hold ids and changed field **names** only, never values: `directory.person.created/updated/moved/archived/deleted/viewed`, `directory.family.*`, `directory.birthdays.viewed`.
- Notes encrypted at rest with `NLTAG_DATA_KEY` (same mechanism as prayer requests).
- Retention, correction and deletion policy, the congregation notice and backup handling need owner approval (roadmap §9.7, D19). Development and staging use fictional records only.

## Where it would live (when approved)

`src/server/directory/service.ts` (all reads/writes, permission checks, transactions) · `src/app/admin/directory/*` (English-first admin, design-system components) · migration `0005_family_directory` (or the next free number) applied to staging first, to production only in an owner-approved window with a verified backup.

## Acceptance tests (to write with the build)

Every workflow above as a MariaDB integration test (no duplicate person; one current family; history kept across marriage and splits); role isolation (404 for every non-directory role); birthday maths in Kuwait time including 29 February, unknown year and year boundaries; the table-boundary test; audit rows contain no names or dates.
