# Motion

**Status:** tokens implemented (Phase 2) · hero animation: Phase 3 · Spec: Phase 1 §8

## Tokens
| Token | Value | Use |
|---|---|---|
| `--motion-duration-instant` | 80ms | press scale |
| `--motion-duration-fast` | 140ms | colour, border |
| `--motion-duration-standard` | 220ms | hover lift, row tint, header shadow |
| `--motion-duration-emphasis` | 360ms | reveals, dialogs in |
| `--motion-duration-slow` | 560ms | rare large panels |
| `--motion-hero-cycle` | 48s | hero drift only |
| `--motion-ease-standard / -enter / -exit / -ambient` | (0.2,0,0,1) / (0.05,0.7,0.1,1) / (0.3,0,0.8,0.15) / (0.45,0,0.55,1) | |
| `--motion-distance-subtle / -standard` | 8 / 16px | reveal offsets |
| `--motion-lift-hover` / `--motion-scale-press` | −2px / 0.98 | cards / buttons |
| `--motion-stagger` | 60ms, max 4 items | list reveals |

## Rules
- Under `prefers-reduced-motion: reduce` every duration, distance, lift, and scale resolve to zero/neutral (verified in the browser suite).
- Only `transform` and `opacity` animate; colour changes use the fast duration.
- No parallax, scroll-jacking, bounce, or looping motion outside the hero. The loading indicator is static (owner decision, Phase 2 review); `npm run test` fails if any `@keyframes` appears outside the hero.
- Content is visible without JavaScript and before any reveal.
- Gradients other than the hero never animate (`animation-name: none` is asserted on the verse card).

## Phase 3 — hero
One animated gradient: four colour fields (`--hero-field-1…4`) on `--hero-base`, soft edges inside `radial-gradient(closest-side, …)` (no live blur filter), only `transform` animates over `--motion-hero-cycle` with `--motion-ease-ambient`. Visible pause control (WCAG 2.2.2) using the glass button with `--color-glass-fill-solid` and no backdrop blur. Static and pause button hidden under reduced motion. Re-test on a real low-end Android phone.
