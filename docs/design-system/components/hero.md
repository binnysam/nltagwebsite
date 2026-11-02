# Hero (homepage)

**Category:** organism · **Status:** implemented (Phase 3) · **Spec:** Phase 1 §3.4, §6, §8 · **Source:** `src/design-system/components/Hero/`

## Overview
The homepage hero is the **only animated gradient** on the site. Use it once, on the homepage. Every other gradient uses `GradientSurface` and stays still.

## Anatomy
| Part | What it is |
|---|---|
| Section | `<section aria-labelledby>`; radius 28 (`--home-hero-radius`), base `--home-hero-surface`, all text `--color-text-on-gradient` (ink-900) |
| Preset layers | The five approved presets in `heroPresetOrder`: Vaigarai → Andhi → Kadal → Thalir → Manal. Crossfade by opacity |
| Field layers | The four approved hero fields (`--home-hero-field-1…4`), drifting by transform, at `--home-hero-field-opacity` (0.35) so the preset stays readable |
| Grain | Approved pre-rendered tile, multiply, static |
| Content | Server-rendered children. Fully visible without JavaScript |
| Motion control | 44 × 44 glass `IconButton`, bottom right. Pause / play glyph, accessible name in the page language (`hero.pause` / `hero.play`) |

All decorative layers are `aria-hidden`, take no pointer events and sit behind content (`--z-behind`).

## API
```tsx
<Hero headingId="hero-title" pauseLabel={t("hero.pause", locale)} playLabel={t("hero.play", locale)}>
  <Heading level={1} styleAs="display-xl" tone="on-gradient" id="hero-title">…</Heading>
  …
</Hero>
```
| Prop | Type | Notes |
|---|---|---|
| `headingId` | string | id of the heading inside; used for `aria-labelledby` |
| `pauseLabel`, `playLabel` | string | approved strings `hero.pause`, `hero.play` |
| `className` | string | layout only |
| `children` | ReactNode | content; use `tone="on-gradient"` on text |

## Motion
| Animation | Changes | Duration | Easing |
|---|---|---|---|
| `hero-preset-crossfade` | opacity | `--motion-hero-preset-cycle` 120s (24s per preset: ≈17s hold, ≈7s crossfade) | `--motion-ease-ambient` |
| `hero-field-drift` | transform | `--motion-hero-cycle` 48s, alternate | `--motion-ease-ambient` |

All layers share one timeline (negative delays), so the first frame is Vaigarai at full strength and a paused hero always shows a real frame.

## States
| State | Attribute | Behaviour |
|---|---|---|
| Before hydration / no JavaScript | `data-ready="false"` | Still first frame. No control (it could not work) |
| Running | `data-motion="running"` | Animations run while on screen |
| Paused by viewer | `data-motion="paused"` | Animations hold the current frame; control reads "play". Remembered for the visit (sessionStorage; falls back to in-memory) |
| Off screen | `data-visible="false"` | Animations pause (IntersectionObserver) |
| Reduced motion | `prefers-reduced-motion: reduce` | No animations, Vaigarai still frame, control hidden. Applies live if the setting changes |
| Forced colours | `forced-colors: active` | Decoration removed; system colours |

## Accessibility
- WCAG 2.2.2: motion longer than 5s has a visible pause control; motion never starts before the control exists.
- Control is a native button: Tab, Enter, Space. Focus stays on it when its name changes.
- Contrast: ink-900 text measured against the darkest background pixel at 40 points across the full cycle; worst case must stay ≥ 6:1 (browser test).
- 44px target; does not overlap content (browser test); content bottom padding reserves its space on phones.

## Performance
- Only `opacity` and `transform` animate: compositor-only, no layout or paint per frame (trace: 0 ms layout/paint during motion).
- No `filter`, no `backdrop-filter`; glass over the hero is the solid fill.
- Pauses off screen and when paused; no JavaScript runs per frame.
- Above-the-fold Tamil faces (Anek Tamil, Noto Sans Tamil) are preloaded so the hero heading does not shift on font swap.
- Measured results: `docs/reports/phase-3-completion-report.md` §3.

## Tests
`tests/e2e/hero.spec.ts` (both viewports, both locales) and `tests/unit/motion-policy.test.ts`.

## Related
`GradientSurface` (static presets), `IconButton` (glass), `Heading`, `ButtonLink`. Motion rules: `motion/motion.md`.
