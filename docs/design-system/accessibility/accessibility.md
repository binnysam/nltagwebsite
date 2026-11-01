# Accessibility

Target: WCAG 2.2 AA. Every component is checked by axe-core in unit tests (jsdom, structure) and in real Chrome at 390px and 1280px (including colour contrast on all five gradients).

## Built-in rules
- **Focus:** global `:focus-visible` ring, 2px blue-700, 3px offset; mouse focus shows no ring.
- **Targets:** every interactive element ≥ 44 × 44px (browser test measures every link, button and input). Language segments are 38px visually with a 44px hit area.
- **Skip link** to `#main` in the header; every page has `<main id="main">` and exactly one `<h1>`.
- **Language:** `<html lang>` per route; mixed-language text carries its own `lang` so fonts and screen-reader voices switch.
- **Colour:** status always has a word; text on gradients is always ink-900; secondary text (ink-500) only on paper.
- **Forms:** visible label above every field; hint and error linked by `aria-describedby`; `aria-invalid` on error; errors in words.
- **Names:** icon buttons require `label`; visible text equals the accessible name (2.5.3).
- **Motion:** reduced-motion zeroes all motion tokens; no looping motion except the hero (with pause) and the spinner (stops; labelled).
- **Forced colours:** gradients and grain are removed so text stays on the system background.
- **Menu:** disclosure with `aria-expanded`/`aria-controls`; Escape closes and returns focus.

## Checks to run before completing UI work
1. `npm run audit:tokens`
2. `npm test` (includes axe on each component)
3. `npm run test:e2e` (axe with contrast, 44px targets, no horizontal scroll at 390px, keyboard menu)
4. Manual: keyboard-only pass, 200% zoom, screen reader spot check in Tamil and English.

## Known gaps (tracked)
- Screen-reader testing with Tamil voices on iOS/Android has not been done yet (Phase 6).
- Square/portrait verse compositions have very small on-screen metadata at phone width; they are export previews, not reading surfaces.
