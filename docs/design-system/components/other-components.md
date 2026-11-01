# Component specifications — header, controls, lists, cards

All implemented in Phase 2 under `src/design-system/components/`. Visual rules come from Phase 1 §6. Tests: `tests/unit/components.test.tsx` and `tests/e2e/design-system.spec.ts`.

---

## SiteHeader
**Use:** once per page, first element of `<body>`.
**Anatomy:** skip link → wordmark (NLTAG, Inter Tight 500, +0.08em, links to `/{locale}`) → primary nav (≥1280px) → LanguageSwitch → one ink pill CTA (≥768px) → menu button (<1280px) → full-width disclosure panel (nav links 48px rows + full-width CTA).
**API:** `locale`, `navItems?: {href,label}[]` (only routes that exist), `currentPath?` (sets `aria-current="page"`), `cta?: {href,label}`. With no nav items and no CTA the menu button is omitted.
**States:** resting (white, no shadow) · scrolled (`data-stuck="true"`, shadow-1) · menu open/closed · nav link hover (paper-100 pill) and current.
**Keyboard:** Tab order follows reading order. Menu button has `aria-expanded` and `aria-controls`; Escape closes the panel and returns focus to the button; following a link closes it. The panel is a disclosure, not a modal, so focus is not trapped.
**Responsive:** the inline nav appears from **1280px** (not 1024): with the Phase 2 draft Tamil labels the four links, switch and CTA wrapped at 1024–1279px. Tamil wording was approved on 1 Nov 2026; re-measure the breakpoint with the approved labels in Phase 3.
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
**Use:** any static gradient area (verse card, meeting art, gallery). Not the hero.
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
**API:** `preset`, `typeLabel`, `dateLabel`, `dateTime`, `titleTa`, `titleEn`, `announcement?`, `href?`, `headingLevel?`.
**States:** with `href` the whole card is clickable through the title link's `::after`; hover and focus-within lift −2px with shadow-2; focus ring drawn on the card.

## Primitives
`Container`, `Section`, `Stack`, `Cluster`, `Grid`, `Divider`, `Surface`, `Heading`, `Text`, `VisuallyHidden`, `Spinner`, `Skeleton`, `Icon` (`src/design-system/primitives`). Gap and padding props accept only space-scale steps. `Skeleton` is static (no shimmer). `Spinner` is a static ring (no rotation); it is decorative and must sit next to a visible label.

## Not yet built (later phases, by plan)
Hero with animated gradient and pause control (Phase 3); dialogs, toasts, tabs, accordion, checkbox, radio, select, date picker, file upload (built when a feature needs them, Phases 4–5); footer and breadcrumbs (Phase 5).
