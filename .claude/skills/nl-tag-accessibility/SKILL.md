---
name: nl-tag-accessibility
description: Use to audit or build NLTAG UI for WCAG 2.2 AA: keyboard, focus, contrast, targets, forms, language, motion and screen readers in Tamil and English.
---

# NLTAG accessibility

## Read first
`docs/design-system/accessibility/accessibility.md`.

## Workflow
1. **Automated:** `npm test` (axe per component) and `npm run test:e2e` (axe incl. contrast on all gradients, 44px targets, no horizontal scroll, menu keyboard flow) at 390px and 1280px.
2. **Keyboard:** Tab through the page; every control reachable in reading order, visible ring (2px blue-700, 3px offset), Escape closes disclosures and returns focus, skip link works.
3. **Structure:** one `<h1>`, ordered headings, landmarks (`header`, `nav` with names, `main#main`), lists as lists.
4. **Language:** `<html lang>` correct; every mixed-language span has `lang`.
5. **Forms:** visible labels, `aria-describedby` for hint and error, errors in words, `aria-invalid`.
6. **Colour:** status has a word; secondary ink-500 only on paper; all gradient text ink-900.
7. **Motion:** reduced motion → static; hero has pause.
8. **Zoom/reflow:** 200% zoom and 320px width without loss.
9. **Screen readers:** spot-check VoiceOver (iOS/macOS) and TalkBack with Tamil and English voices.

## Output
Findings table: issue, WCAG criterion, location, severity, fix. Fix critical and high before handing back.

## Escalate
Any approved design value that fails a criterion (report the measurement and a token-level fix; do not silently change approved tokens).
