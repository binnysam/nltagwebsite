---
name: nl-tag-design-system
description: Use for any change to NLTAG tokens, foundations, component specs, patterns or the token audit, and before any UI work that might need a new visual value.
---

# NLTAG design system

## Purpose
Keep every screen on the approved NLTAG system: warm paper surfaces, warm-charcoal ink, bilingual editorial type, five static gradients, one animated hero. Look up, don't make up.

## Use when
- Adding or changing a token, component, variant, pattern or icon.
- A UI task seems to need a colour, size, radius, shadow, duration or z-index that you cannot find.
- The token audit fails.

## Required inputs
The request, plus the affected component or page.

## Read first
1. `docs/reference/NLTAG-PHASE-1-VISUAL-FOUNDATIONS.md` (authority) and Gate decisions in the claude.ai project.
2. `docs/design-system/foundations/foundations.md`
3. `docs/design-system/tokens/token-reference.md`
4. The component spec in `docs/design-system/components/`
5. `docs/design-system/governance/governance.md`
6. `LLM-DESIGN-SYSTEMS.md` (method)

## Workflow
1. Find the existing token or component. Search `src/design-system` before writing anything.
2. If nothing fits, stop and propose: the gap, the closest existing option, and a named token with its value and source. Wait for approval before adding it.
3. Add tokens to `component-tokens.css` only (layer 3), marked `[ADDITION]` until approved, and list them in `token-reference.md`.
4. Never edit `src/design-system/tokens/tokens.css`. It is byte-locked to the approved file by a test.
5. Update the spec and the private gallery (`src/app/[locale]/design-system/page.tsx`).
6. Run the validation checklist.

## Rules
- Components reference semantic (layer 2) and component (layer 3) tokens only. Primitive tokens (`--paper-*`, `--ink-*`, `--line-*`, status, `--glass-*`, `--hero-*`) stay in the token files.
- All text on gradients is `--color-text-on-gradient`.
- Light mode only at launch. Do not add a dark theme.
- Only the hero animates its gradient. Everything else is static.
- No parallel visual language for any feature.

## Validation checklist
- [ ] `npm run audit:tokens` passes with no new exceptions (or each exception has a reason and owner approval)
- [ ] `npm test` and `npm run test:e2e` pass
- [ ] Spec and token reference updated
- [ ] Gallery shows every new state

## Output
A short report: tokens/components touched, sources for every value, tests run, anything awaiting approval.

## Escalate
Any change to an approved Phase 1 value, a new gradient, a new typeface, a dark theme, or a request that conflicts with Gate decisions.
