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
- **The homepage hero is the only animated gradient.** Verse cards, meeting art and all other gradients are static.
- Animate `transform` and `opacity` only. No `filter: blur()` animation; hero fields carry their soft edge in `radial-gradient(closest-side, …)`.
- Over the moving hero, glass uses `--color-glass-fill-solid` and no `backdrop-filter`.
- No parallax, scroll-jacking, bounce, or looping motion outside the hero. The loading spinner is the only exception and stops under reduced motion.
- Hero must have a visible pause control (WCAG 2.2.2), hidden when reduced motion is on (hero is then static).
- Reveals start from a visible state; content never waits on JavaScript or an observer.
- Stagger at most 4 items, 60ms apart.

## Workflow
1. Name the purpose of the motion (feedback, orientation, atmosphere). If none, don't add it.
2. Pick existing tokens; ask before adding any.
3. Implement with CSS transitions/animations reading tokens; the reduced-motion block in `tokens.css` zeroes them automatically.
4. Test: browser suite asserts zeroed durations under reduced motion; for the hero, measure frame rate on a throttled 390px profile (target ≥ 55fps, CLS 0) and on a real low-end Android phone before launch.

## Escalate
Any new looping or ambient motion, video backgrounds, or motion libraries.
