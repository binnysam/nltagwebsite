# Token reference

**Status:** Phase 2 implementation · last updated 1 Nov 2026
**Files:** `src/design-system/tokens/tokens.css` (approved, never edited) · `src/design-system/tokens/component-tokens.css` (layer 3)

## Layers

| Layer | Where | Who may use it |
|---|---|---|
| 1 Primitive — `paper-*`, `ink-*`, `line-*`, status `*-700/50`, `glass-*`, `hero-*`, gradient stops | `tokens.css` | Token files only. The audit fails if a component references one. |
| 2 Semantic — `color-surface-*`, `color-text-*`, `color-border-*`, `color-action-*`, `color-focus-ring`, `color-status-*`, type, space, radius, shadow, motion | `tokens.css` | Components |
| 3 Component — font stacks, control sizes, verse card, glass aliases, z-index, header | `component-tokens.css` | Components |

`tokens.css` is a byte-identical copy of the approved `tokens.final.css` (SHA-256 `909a67ca…edf58`). A unit test fails if it changes. Changing an approved value needs owner approval and a new Phase 1 decision record.

## Semantic tokens (summary)

| Group | Tokens |
|---|---|
| Surfaces | `--color-surface-page` (paper-50) · `-card` (paper-0) · `-subtle` (paper-100) · `-sunken` (paper-200) |
| Text | `--color-text-primary` (ink-900) · `-strong-secondary` (ink-700) · `-secondary` (ink-500, paper only) · `-on-gradient` (ink-900, **all** text on gradients) · `-inverse` · `-disabled` (ink-400, disabled state only) |
| Borders | `--color-border-subtle` (line-10, decorative) · `-strong` (line-18, secondary button) · `-control` (ink-400, inputs ≥3:1) |
| Actions | `--color-action-primary` / `-hover` / `-pressed` |
| Focus | `--color-focus-ring` (blue-700) |
| Status | `--color-status-{info,success,warning,error}-{text,surface}` |
| Type | `--text-*`, `--leading-*`, `--tracking-*`, `--font-weight-*`, `--measure-*` |
| Space | `--space-1…10` = 4, 8, 12, 16, 24, 32, 48, 64, 96, 128 px |
| Radius | `--radius-sm` 8 · `-md` 12 · `-lg` 20 · `-xl` 28 · `-pill` |
| Elevation | `--shadow-1/2/3` (warm, always with line-10 hairline) |
| Gradients | `--gradient-{vaigarai,manal,kadal,andhi,thalir}`, `--texture-grain*` |
| Motion | `--motion-duration-*`, `--motion-ease-*`, `--motion-distance-*`, `--motion-lift-hover`, `--motion-scale-press`, `--motion-stagger`, `--motion-hero-cycle` |

## Component tokens taken from the approved documentation

These carry numbers written in the Phase 1 document; they add names, not new decisions.

| Token | Value | Source |
|---|---|---|
| `--font-stack-{ta,en}-{display,body,scripture}` | next/font face + approved fallback stack | §4.1–4.2 |
| `--leading-h1-en` 1.15, `--tracking-h1-en` −0.015em, `--leading-h3-en` 1.3, `--leading-display-l-ta` 1.3, `--leading-h1-ta` 1.4, `--leading-h3-ta` 1.5, `--leading-small-en` 1.5, `--tracking-small-en` 0.01em, `--leading-small-ta` 1.7 | | §4.3 table |
| `--tracking-wordmark` | 0.08em | §6 Header |
| `--focus-ring-width` 2px, `--focus-ring-offset` 3px | | §6 Button |
| `--border-width-hairline` 1px, `--border-width-strong` 2px | | §6 Form field, §3.4 |
| `--control-height` | `var(--target-min)` 44px | §5 |
| `--control-height-input` | 48px | §6 Form field |
| `--control-segment-height` 38px, `--control-segment-inset` 3px | | §6 Language switch |
| `--button-padding-inline` 20px, `-compact` 16px | | §6 Button |
| `--color-border-control-hover` | ink-700 | §6 Form field |
| `--header-height` | `var(--space-8)` 64px | Phase 1 preview |
| `--grid-gap-resolved` | 16px → 24px from 1024 | §5 |
| `--section-padding-block` | 64px → 96px from 1024 | §5 |
| `--verse-*` (radius 28, shadow-2, padding, rule 40px, measures 34ch/40ch, leading 1.75/1.45, 64px export margin) | | §7 |
| `--meeting-art-ratio` | 16 / 10 | §6 Special meeting card |
| `--color-glass-fill`, `-fill-solid`, `-edge` | aliases of `glass-*` | §3.1, §8.2 |
| `--home-hero-surface`, `--home-hero-field-1…4` | aliases of `hero-base`, `hero-field-1…4` | §3.4, §8 (Phase 3) |
| `--home-hero-radius` | `var(--radius-xl)` 28px | §5 (hero radius) |

## Additions awaiting owner sign-off

Phase 1 did not specify these values. They were needed to implement the approved components and are kept small and conservative. Each is marked `[ADDITION]` in the file.

| Token | Value | Why |
|---|---|---|
| `--leading-control` | 1.4 | Line height for single-line button and switch labels |
| `--icon-size` / `--icon-size-small` | 20px / 14px | Interface icons (menu, share, download) and the hero pause glyph |
| `--badge-dot-size` / `--badge-padding-block` | 6px / 2px | Status badge anatomy |
| `--spinner-size` / `--spinner-stroke` | 16px / 2px | Loading state: static ring + label (no rotation) |
| `--z-behind/base/raised/header/menu/skip-link` | −1 / 0 / 1 / 10 / 20 / 30 | Stacking order |
| `--verse-social-text-ta/en`, `--verse-social-meta` | 4.2 / 3.4 / 2.2 cqi (≈45 / 37 / 24px at 1080) | Type sizes for the square and portrait export compositions |
| `--verse-landscape-text-ta/en` | 3 / 2.4 cqi, clamped to h3…h1 and body-l…h2 | Fluid sizing for the landscape feature card |
| `--motion-hero-preset-cycle` (Phase 3) | `calc(var(--motion-hero-cycle) * 2.5)` = 120s | One pass through the five presets in the hero: 24s each (≈17s hold, ≈7s crossfade). Derived from the approved 48s cycle. **Approved by owner, 1 Nov 2026** |
| `--home-hero-field-opacity` (Phase 3) | 0.35 | The approved hero fields drift over the presets at this strength; at full strength they muddied Kadal and Andhi (review screenshots in the Phase 3 report). **Approved by owner, 1 Nov 2026** |

## Rules

- Components use layers 2–3 only. `npm run audit:tokens` enforces this.
- Never approximate: if no token fits, stop and ask, then add a documented token.
- A token is never renamed or removed without updating every reference and this file.
- Reviewed exceptions use `token-audit-ignore: <reason>` on the same line. Current: 1 (`themeColor` in the root layout, which the Next.js metadata API requires as a literal).
