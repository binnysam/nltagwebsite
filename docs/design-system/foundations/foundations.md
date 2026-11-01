# Foundations

**Status:** Implemented (Phase 2) · Source: `docs/reference/NLTAG-PHASE-1-VISUAL-FOUNDATIONS.md` (approved 1 Nov 2026)

This file is the working summary for implementers. The Phase 1 document remains the authority; if they disagree, the Phase 1 document wins and this file is corrected.

## 1. Direction
Warm paper surfaces and warm-charcoal ink carry every page. Colour appears only in the homepage hero (one slow animated gradient with a pause control — Phase 3), the Bible Verse Showcase Card and event artwork (static gradients with grain). Light mode only at launch; tokens remain theme-ready. Tamil is the default language.

## 2. Colour
- Page `surface-page`, cards `surface-card`, hover and subtle fills `surface-subtle`, disabled and sunken fills `surface-sunken`.
- Body text `text-primary`; secondary text `text-secondary` **on paper surfaces only**.
- **All text on a gradient is `text-on-gradient` (ink-900)**, including metadata. ink-500 fails on gradients (2.42:1).
- Inputs, checkboxes and radios use `border-control` (ink-400, ≥3:1). Cards and dividers use `border-subtle` (decorative). Secondary buttons use `border-strong` (the label identifies the control).
- Status colours always come with a word. Never use colour alone.
- Measured contrast: Phase 1 §3.2. Browser tests re-check with axe on every gradient preset.

## 3. Typography
| Role | Tamil | English |
|---|---|---|
| Display (display-xl, display-l) | Anek Tamil 300 | Inter Tight 300 |
| Headings h1–h3, schedule names, card titles | Anek Tamil 400 | Inter Tight 400 |
| Body | Noto Sans Tamil 400/500 | Inter 400/500 |
| Scripture (verse card only) | Noto Serif Tamil 400 | Newsreader 400 |

- Apply styles with `<Heading level styleAs>` and `<Text variant>`; Tamil rules switch on automatically through `lang`.
- Tamil: never negative tracking, uppercase transforms or eyebrow letter-spacing. Line heights 1.28 / 1.3 / 1.4 / 1.45 / 1.5 / 1.8.
- Measures: English 64ch, Tamil 60ch.
- Any English text inside a Tamil page must carry `lang="en"` (and the reverse) so the correct face, size and screen-reader voice apply.
- Fonts are self-hosted with `next/font/local` (`src/design-system/fonts`). Each Tamil family is split into a Tamil-range face and a Latin-range face so digits and "NECK" inside Tamil text use the family's own Latin glyphs, as on the approved board.

## 4. Space and layout
- Space scale 4, 8, 12, 16, 24, 32, 48, 64, 96, 128 (`--space-1…10`).
- Section padding 64px on phones, 96px from 1024px (`<Section>`).
- Content 1200px, wide 1360px, fluid gutter 16→32px (`<Container>`).
- 12-column grid, 16px gap, 24px from 1024px (`<Grid>`).
- Breakpoints 480 / 768 / 1024 / 1280 (media queries use literals; the `--bp-*` tokens are reference only).
- Minimum interactive target 44 × 44px everywhere.
- Bento grids only where content weights differ. Schedules and forms are single-column lists.

## 5. Shape and elevation
- Radius: pill for actions, chips and switches; 8 inner; 12 inputs; 20 cards; 28 hero and verse card.
- Elevation: shadow-1 resting (and sticky header), shadow-2 hover and verse card, shadow-3 dialogs and menus. Every shadow token already includes the line-10 hairline.

## 6. Surfaces, gradients, glass
- Five static presets: Vaigarai (default verse card), Manal, Kadal, Andhi, Thalir. Use `<GradientSurface preset>`.
- Grain: pre-rendered deterministic tile (seed 7), multiply blend, 0.32 opacity. Falls back to the plain gradient; removed in forced-colours mode.
- Glass pills only over gradients. Over the animated hero use the solid glass fill with no backdrop blur (performance, §8.2). Backdrop blur is allowed over static gradients.
- Decorative layers never take pointer events and never sit inside a control.

## 7. Iconography
A small set of 20×20 line icons drawn for NLTAG (`<Icon name>`): menu, close, pause, play, share, download, arrow-right. Stroke 1.6, round caps, `currentColor`. Always decorative; the control supplies the accessible name. Add icons only when a feature needs one, in the same style.

## 8. Localisation
- Routes: `/ta/...` (default) and `/en/...`; `/` redirects to `/ta`.
- `<html lang>` follows the route.
- Interface strings: `src/content/ui-strings.ts`. Tamil entries are `draft-review` until the church approves them (review sheet: `docs/content/tamil-content-review.md`).
- Church facts never live in interface strings. The schedule lives in `src/content/schedule.ts` (Gate 0) and later the CMS.
- Dates and the daily verse use Asia/Kuwait (`src/lib/date.ts`).
