---
name: nl-tag-motion-system
description: Use for any animation, transition, hero gradient, reveal, hover feedback or reduced-motion behaviour on the NLTAG site.
---

# NLTAG motion system

## Purpose
Calm, purposeful motion that never distracts from worship or reading.

## Read first
`docs/design-system/motion/motion.md` and Phase 1 §8.

## Rules
- Use `--motion-*` tokens only. Durations: instant 80 / fast 140 / standard 220 / emphasis 360 / slow 560 ms.
- **The homepage hero is the only animated gradient.** Verse cards, meeting art and all other gradients are static. Use the `Hero` component (`docs/design-system/components/hero.md`); never build a second animated surface.
- The hero crossfades the five approved presets (opacity) and drifts the four approved fields (transform). Don't add presets, layers or keyframes to it without owner approval.
- Hero motion starts only after hydration (no JavaScript → still), pauses off screen and when the viewer pauses it, and is a still Vaigarai frame under reduced motion.
- Animate `transform` and `opacity` only. No `filter: blur()` animation; hero fields carry their soft edge in `radial-gradient(closest-side, …)`.
- Over the moving hero, glass uses `--color-glass-fill-solid` and no `backdrop-filter`.
- No parallax, scroll-jacking, bounce, or looping motion outside the hero. No exceptions: the loading indicator is a static ring beside its label (owner decision, Phase 2 review). A unit test fails on any `@keyframes` outside `Hero/hero.module.css`, and on any hero keyframe that changes something other than opacity or transform.
- Hero must have a visible pause control (WCAG 2.2.2), hidden when reduced motion is on (hero is then static).
- Reveals start from a visible state; content never waits on JavaScript or an observer.
- Stagger at most 4 items, 60ms apart.

## Workflow
1. Name the purpose of the motion (feedback, orientation, atmosphere). If none, don't add it.
2. Pick existing tokens; ask before adding any.
3. Implement with CSS transitions/animations reading tokens; the reduced-motion block in `tokens.css` zeroes them automatically.
4. Test: browser suite asserts zeroed durations under reduced motion; `tests/e2e/hero.spec.ts` covers the hero (only transform/opacity, pause by keyboard, reduced motion, no-JS still frame, off-screen pause, contrast across the whole cycle, CLS). Measure frame rate on a throttled 390px profile (target ≥ 55fps, CLS 0) and on a real low-end Android phone before launch.

## Escalate
Any new looping or ambient motion, video backgrounds, or motion libraries.
