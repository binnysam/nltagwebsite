# Motion

**Status:** tokens (Phase 2) and homepage hero (Phase 3) implemented · Spec: Phase 1 §8

## Tokens
| Token | Value | Use |
|---|---|---|
| `--motion-duration-instant` | 80ms | press scale |
| `--motion-duration-fast` | 140ms | colour, border |
| `--motion-duration-standard` | 220ms | hover lift, row tint, header shadow |
| `--motion-duration-emphasis` | 360ms | reveals, dialogs in |
| `--motion-duration-slow` | 560ms | rare large panels |
| `--motion-hero-cycle` | 48s | hero field drift |
| `--motion-hero-preset-cycle` | 120s (`hero-cycle × 2.5`) | hero preset crossfade: 24s per preset `[ADDITION]` |
| `--motion-ease-standard / -enter / -exit / -ambient` | (0.2,0,0,1) / (0.05,0.7,0.1,1) / (0.3,0,0.8,0.15) / (0.45,0,0.55,1) | |
| `--motion-distance-subtle / -standard` | 8 / 16px | reveal offsets |
| `--motion-lift-hover` / `--motion-scale-press` | −2px / 0.98 | cards / buttons |
| `--motion-stagger` | 60ms, max 4 items | list reveals |

## Rules
- Under `prefers-reduced-motion: reduce` every duration, distance, lift, and scale resolve to zero/neutral (verified in the browser suite).
- Only `transform` and `opacity` animate; colour changes use the fast duration.
- No parallax, scroll-jacking, bounce, or looping motion outside the hero. The loading indicator is static (owner decision, Phase 2 review). `npm run test` fails if any `@keyframes` appears outside `Hero/hero.module.css`, if the hero declares anything but its two animations, or if those change anything but `opacity` and `transform`; the browser suite fails if anything outside the hero animates on the homepage.
- Content is visible without JavaScript and before any reveal.
- Gradients other than the hero never animate (`animation-name: none` is asserted on the verse card).

## Homepage hero (Phase 3)
Component spec: `components/hero.md`.

| Layer | Motion | Rule |
|---|---|---|
| Five approved presets (Vaigarai → Andhi → Kadal → Thalir → Manal) | `hero-preset-crossfade`: opacity, 120s cycle, ≈17s hold and ≈7s crossfade each, `--motion-ease-ambient` | Same timeline for all layers; first frame is Vaigarai |
| Four approved hero fields at 0.35 opacity | `hero-field-drift`: transform, 48s alternate (Phase 1 keyframes) | Soft edges in `radial-gradient(closest-side, …)`; no blur filter |
| Grain | none | Static tile |

When it moves: only after hydration, while the viewer has not paused it, while it is on screen, and when reduced motion is not requested. Otherwise it shows the first frame, still.

Control: 44px glass icon button (solid fill, no backdrop blur), bottom right, pause/play in the page language, remembered for the visit. Hidden under reduced motion and absent without JavaScript (the hero is then still).

Measured (Phase 3 report §3): 60 fps at 390px / 3× DPR with CPU slowed 4× and 6×; no layout or paint during motion; CLS from motion and the control: 0. **Still open: a check on a real low-end Android phone** (pre-launch checklist item 10).
