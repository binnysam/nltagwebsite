# Pre-launch approval checklist

**Started:** 1 November 2026 · Items that need owner approval or a check before any public launch. They do not block the migration or Phase 3 work. Nothing here is published while every route is `noindex` and nothing is deployed.

## Tamil wording not yet in the approval record

Produced by formatters, not part of the 48 approved items (`docs/content/tamil-content-review.md`, "Not yet in the record").

| # | Where | Current Tamil | Status |
|---|---|---|---|
| 1 | Weekday names (`src/content/schedule.ts`) | ஞாயிற்றுக்கிழமை, திங்கட்கிழமை, செவ்வாய்க்கிழமை, புதன்கிழமை, வியாழக்கிழமை, வெள்ளிக்கிழமை, சனிக்கிழமை | Awaiting owner approval |
| 2 | Weekly recurrence prefix | ஒவ்வொரு … | Awaiting owner approval |
| 3 | Monthly recurrence | ஒவ்வொரு மாதத்தின் கடைசி … | Awaiting owner approval |
| 4 | Special meetings, when | தனித்தனியாக அறிவிக்கப்படும் | Awaiting owner approval |
| 5 | Cottage Meeting, where | சபை அங்கத்தினர்களின் வீடுகளில் | Awaiting owner approval |
| 6 | Special meetings, where | நிகழ்ச்சியைப் பொறுத்து | Awaiting owner approval |

## Date formatting

| # | Where | Current output | Status |
|---|---|---|---|
| 7 | `src/lib/date.ts` (standard Intl formatter, Kuwait calendar date) | Tamil: `1 நவம்பர், 2026` · English: `1 November 2026` | Awaiting owner approval of format and Tamil month names |

## Other pre-launch checks (from the Phase 2 report)

| # | Item | Status |
|---|---|---|
| 8 | Hostinger's Node 22.x patch version, checked in hPanel at deployment | Open |
| 9 | Bible reproduction permission (BSI Tamil, NKJV) and exact credit lines; verse card stays a placeholder until then | Open |
| 10 | Hero check on a real low-end Android phone (Phase 1 §8.2). Emulated profiles pass (Phase 3 report §3); steps for the real check in Phase 3 report §5 | Open — needs a device. Owner: does not block Phase 4; must close before launch |
| 11 | Repository visibility (currently public) | Owner decision |
| 12 | Hero welcome copy (Tamil and English) — CONTENT REQUIRED. The hero currently shows the church name and the approved notice "This website is being prepared." | Awaiting church content |
| 13 | Phase 3 token additions: `--motion-hero-preset-cycle` (120s) and `--home-hero-field-opacity` (0.35); Tamil font preload on both locales | Approved by owner, 1 Nov 2026 |
