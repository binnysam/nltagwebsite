# Component specifications — header, controls, lists, cards

All implemented in Phase 2 under `src/design-system/components/`. Visual rules come from Phase 1 §6. Tests: `tests/unit/components.test.tsx` and `tests/e2e/design-system.spec.ts`.

---

## SiteHeader
**Use:** once per page, first element of `<body>`.
**Anatomy:** skip link → wordmark (NLTAG, Inter Tight 500, +0.08em, links to `/{locale}`) → primary nav (≥1280px) → LanguageSwitch → one ink pill CTA (≥768px) → menu button (<1280px) → full-width disclosure panel (nav links 48px rows + full-width CTA).
**API:** `locale`, `navItems?: {href,label}[]` (only routes that exist), `currentPath?` (sets `aria-current="page"`), `cta?: {href,label}`. With no nav items and no CTA the menu button is omitted.
**States:** resting (white, no shadow) · scrolled (`data-stuck="true"`, shadow-1) · menu open/closed · nav link hover (paper-100 pill) and current.
**Keyboard:** Tab order follows reading order. Menu button has `aria-expanded` and `aria-controls`; Escape closes the panel and returns focus to the button; following a link closes it. The panel is a disclosure, not a modal, so focus is not trapped.
**Public site (Phase 5):** four links — About, Worship times, Sermons, Contact; the wordmark is the home link and "Home" is in the footer. Measured: five Tamil links + switch + the Tamil CTA overflowed by 72px at 1280px; four fit.
**Responsive:** the inline nav appears from **1280px** (not 1024): with the Phase 2 draft Tamil labels the four links, switch and CTA wrapped at 1024–1279px. Tamil wording was approved on 1 Nov 2026; re-measure the breakpoint with the approved labels in Phase 3. Re-measured in staging QA (Nov 2026): with the approved Tamil labels the row was 34px wider than the 1200px container at every desktop width, so from 1280px the Tamil header uses `--space-2` link padding and a `--space-3` bar gap (English unchanged); `tests/e2e/public-site.spec.ts` checks the row stays inside the container at 1280 and 1440px.
**Tokens:** `--header-height`, `--z-header`, `--tracking-wordmark`, `--shadow-1`, `--color-surface-card`, `--color-border-subtle`.

## LanguageSwitch
**Use:** in the header only.
**Behaviour:** two links (it navigates), each with `lang` and `hreflang`, the current one `aria-current="true"`; keeps the equivalent page (`switchLocalePath`). The visible text ("தமிழ்", "EN") is the accessible name (WCAG 2.5.3).
**Visual:** segmented pill on paper-100, 44px control, 38px segments with a `::after` hit area extended to 44px; selected segment white + shadow-1.
**Deviation note:** Phase 1 listed `aria-pressed`; links with `aria-current` are the correct pattern for navigation, so this was used instead.

## TextField
**Use:** every text input and textarea (prayer, contact and membership forms in later phases).
**Anatomy:** label above (14px/500) with optional "(Required)" word → hint (13px ink-500) → control → error message in words.
**API:** `id`, `label`, `hint?`, `error?`, `requirementText?`, `multiline?`, plus native input/textarea props.
**States:** default (ink-400 edge) · hover (ink-700) · focus-visible (ring + ink-900 edge) · invalid (`aria-invalid`, 2px red-700 edge drawn inset, message) · disabled (paper-100, ink-400 text) · read-only (paper-100).
**Accessibility:** `<label for>`, hint and error joined in `aria-describedby`; error never colour-only. Input height 48px.

## StatusBadge / MembershipStatusBadge
**Use:** short states. Membership mapping: Draft → neutral · Email verified, Pending review → info · Correction requested → warning · Active → success · Rejected → error. Tamil labels approved 1 Nov 2026.
**Visual:** pill, 13px/500, dot + word, 700 text on 50 fill. The dot is `aria-hidden`; the word carries meaning.

## GradientSurface
**Use:** any static gradient area (verse card, meeting art, gallery). Not the hero (see `hero.md`).
**API:** `preset`, `as?`. Sets `color: var(--color-text-on-gradient)`. Grain via `::after`, `pointer-events: none`, falls back to the plain gradient, removed in forced-colours mode.

## ScheduleList
**Use:** worship schedule (homepage section and worship-times page in Phase 5).
**Data:** `src/content/schedule.ts` only (Gate 0); later the CMS. Times, days and NECK are confirmed; Tamil gathering names were supplied by the owner and காலை/மாலை approved (1 Nov 2026). Weekday names and other formatter phrases still need confirmation (see the approval record).
**Anatomy:** `<ul role="list">` of rows: name (page language, Anek Tamil 400 / Inter Tight 400) with the other language beneath (14px ink-500, own `lang`) → when (tabular numerals) → where. Screen readers get "When:" / "Where:" prefixes.
**Responsive:** one column below a 680px container width; three columns (5fr / 5fr / 3fr) above.
**States:** row tint paper-100 on hover.
**Rules:** NECK exactly; no address; Cottage Meeting hosts never published; Sunday School shown on Friday.

## SectionIntro (section micro-hero)
Eyebrow (14px ink-500) → display-l heading with `id` (for `aria-labelledby`) → lead (18px ink-500, 64ch / 60ch) → at most one pill CTA. Left-aligned.

## SpecialMeetingCard
**Use:** CMS special meetings only. No sample content on public pages.
**Anatomy:** `<article>` → 16:10 gradient art with grain and a glass type pill (backdrop blur allowed: static gradient) → body: `<time>` date, Tamil title (heading, Anek Tamil 400), English title (14px ink-500), announcement.
**API:** `preset`, `typeLabel`, `dateLabel`, `dateTime`, `titleTa`, `titleEn`, `primary?` (`"ta"` default — which title is the heading; pass the page language), `location?` (public venue line: NECK, members' homes or a named place, never an address), `announcement?`, `href?`, `headingLevel?`.
**Phase 5:** the heading is the page-language title with the other language beneath (page-composition "Bilingual blocks"); if the page language has no title, the other becomes the heading and no empty line is drawn. The type pill takes the page language.
**States:** with `href` the whole card is clickable through the title link's `::after`; hover and focus-within lift −2px with shadow-2; focus ring drawn on the card.

## Primitives
`Container`, `Section`, `Stack`, `Cluster`, `Grid`, `Divider`, `Surface`, `Heading`, `Text`, `VisuallyHidden`, `Spinner`, `Skeleton`, `Icon` (`src/design-system/primitives`). Gap and padding props accept only space-scale steps. `Skeleton` is static (no shimmer). `Spinner` is a static ring (no rotation); it is decorative and must sit next to a visible label.

## Not yet built (later phases, by plan)
Toasts, tabs, accordion, radio, custom date picker (native date inputs are used), styled file upload (built when a feature needs them); breadcrumbs. Footer: built in Phase 5 (below).

## Phase 5 additions (public website)
Built from existing tokens only; in the gallery ("Entry list", footer at the bottom of the page).

### EntryList (`EntryList/`)
- **When:** lists of CMS records on the public site — announcements, sermons, ministries, testimonies. Not for the schedule (ScheduleList) or special meetings (SpecialMeetingCard).
- **Anatomy:** `<ul role="list" aria-label>` with hairline top and row dividers (same rhythm as ScheduleList, padding 24px) → each row: meta line (14px secondary, tabular numerals) → title (`h3` by default; Anek Tamil 400 / Inter Tight 400, h3 size) → body (reading measure 64ch / 60ch) → at most one action.
- **API:** `entries: { id, title, href?, titleLang?, meta?, children?, action? }[]`, `headingLevel?` (2 | 3), `label?`.
- **States:** static; no hover tint (rows are not links). With `href` (Nov 2026, Phase A) the title is a hairline-underlined link to the record's own page (44px min height, `--border-width-strong` underline on hover, colour unchanged). Links inside keep 44px targets.
- **A11y:** list named by its section; titles are headings in the page outline; Markdown headings inside a body start at h4 (`<Markdown headingLevel={4}>`).

### SiteFooter (`SiteFooter/`)
- **When:** once per public page, after `<main>`.
- **Anatomy:** `<footer>` on `surface-subtle` with a hairline top edge, padding 64 / 48 → wordmark (as the header) → church name in the page language (h3 size) with the other language beneath (14px secondary, own `lang`) → `<nav aria-label>` of links (14px/500 `text-strong-secondary`, 44px rows, wrap) → one secondary note. Two columns (5fr / 7fr) from 1024px.
- **API:** `locale`, `name` (confirmed name in both languages), `navItems`, `note?`.
- **Rules:** confirmed information only — no address, phone, social accounts or copyright claims unless the church supplies them. Dialog (ConfirmButton), checkbox and select were added in Phase 4c (below).

## Phase 4c additions (admin and forms; usable anywhere)
Built for the CMS admin from existing tokens only; listed in the gallery (`/[locale]/design-system`, "Form fields and status").

### SelectField / CheckboxField (`TextField/SelectField.tsx`)
- **When:** choosing one option from a short fixed list; a single yes/no setting.
- **Anatomy:** SelectField = TextField anatomy (label 14/500 above, hint, 48px control, radius 12, `border-control`, error in words). CheckboxField = native checkbox (20px, `accent-color: --color-action-primary`) inside its label; the label row is the 44px target.
- **A11y:** visible label is the accessible name; hint and error via `aria-describedby`; `aria-invalid` on error.
- **CheckboxField `error` / `required` (Nov 2026):** optional, for required consents on the public forms; the error is a sentence under the box, linked by `aria-describedby`, and the box gets `aria-invalid`. Existing uses are unchanged.

### PublicForm (`src/app/[locale]/_components/forms/PublicForm.client.tsx`, Nov 2026)
- **What:** the prayer, contact and testimony forms. A composition of TextField, SelectField, CheckboxField, Button (`loading`) and Notice; no new visual values (`public-form.module.css`: tokens only, single column at `--measure-en`).
- **Behaviour:** works without JavaScript (server action POST); with it, typed text is kept on errors and focus moves to the result Notice. Errors in words in the page language. Honeypot field is `ds-visually-hidden` inside `aria-hidden`.

### VideoEmbed (`src/app/[locale]/_components/VideoEmbed.client.tsx`, Nov 2026)
- **What:** click-to-load YouTube (privacy-enhanced `youtube-nocookie.com`) on sermon pages. Before "Play video" nothing is requested from YouTube or Google (no thumbnail, script or iframe). 16:9, `--radius-lg`, `--color-surface-sunken`, hairline border; static. The page's "Watch the sermon" link stays as the fallback and the no-JS path.

### Notice (`Notice/`)
- **When:** result of an action, page-level warnings, error summaries.
- **Anatomy:** status surface + status text tokens (same pairs as StatusBadge), radius 12, hairline edge, title in words + optional body. Links in an error-summary list keep 44px.
- **A11y:** `error` → `role="alert"`; other tones → `role="status"`. Never colour alone. Static (no timer).

### DataTable (`DataTable/`)
- **When:** lists staff compare across columns (content lists, audit log). Not for public schedules (use ScheduleList).
- **Anatomy:** card surface (radius 20, shadow-1), hairline row dividers, header 14/500 `text-strong-secondary`, row hover `surface-page`.
- **A11y:** `<caption>` (optionally visually hidden) names the table; the wrapper is a focusable, labelled region that scrolls sideways on narrow screens so the page never does.

### ConfirmButton (`ConfirmDialog/ConfirmDialog.client.tsx`)
- **When:** unpublish, archive, delete, remove a role, record a permission — anything that changes public output or is hard to undo.
- **Anatomy:** trigger Button; native modal `<dialog>`: card surface, radius 20, shadow-3, title (h3 style), message saying what happens and whether it can be undone, Cancel (secondary, focused) + confirm (primary).
- **A11y:** `showModal()` traps focus; Escape/Cancel close and return focus to the trigger; named by its title, described by its message.
- **Backdrop:** `--color-scrim` (ink at 40%; approved by owner 2 Nov 2026). Use it for every modal backdrop; never a new overlay colour.
