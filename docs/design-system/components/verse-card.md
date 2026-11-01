# Bible Verse Showcase Card (signature component)

| | |
|---|---|
| Category | Organism · content |
| Status | Implemented — visual and structure (Phase 2). PNG export and sharing behaviour: Phase 5 |
| Source | `src/design-system/components/VerseCard/` · data type `src/content/bible.ts` |
| Spec | Phase 1 §7 |

## Purpose
Presents the daily verse in Tamil and English on a static gradient with grain. It is the one place the serif scripture faces appear.

## Integrity rules (non-negotiable)
- Verse text only from a church-approved CMS record. Never written in code, tests or docs.
- Until reproduction permission for BSI Tamil and NKJV is confirmed, only `placeholderVerse()` is used. It shows the **Placeholder** chip and labelled placeholder text.
- Reference, translation labels and publisher credit line are always visible.
- No record scheduled → `verse={null}` → designed fallback ("Today's verse will be published soon."). Never invented text.
- Daily selection is deterministic for the Asia/Kuwait date (`kuwaitDateKey`).

## Anatomy (Editorial A)
`<figure>` gradient surface → top row (NLTAG · Today's verse, optional placeholder chip) → Tamil `<blockquote lang="ta">` → 40px line-18 rule → English `<blockquote lang="en">` → `<figcaption>` (reference · translations, credit line, date) → optional export guide (preview only).
**Split C:** the two blockquotes sit side by side with a line-18 divider when the card is ≥ 620px wide (container query); stacked, Tamil first, below that.

## API
| Prop | Type | Default |
|---|---|---|
| `verse` | `VerseRecord \| null` | required |
| `locale` | `"ta" \| "en"` (labels and fallback) | required |
| `dateLabel` | string, already formatted in Kuwait time | required |
| `composition` | `"editorial" \| "split"` | `"editorial"` |
| `variant` | `"landscape" \| "compact" \| "square" \| "portrait"` | `"compact"` |
| `languages` | `"both" \| "ta" \| "en"` | `"both"` |
| `preset` | `vaigarai \| manal \| kadal \| andhi \| thalir` | `"vaigarai"` |
| `showExportGuide` | boolean (square/portrait only) | false |
| `id` | string — node id for the Phase 5 exporter | — |

`VerseCardActions` holds Share and Download PNG **outside** the card node, so they are never exported.

## Variants
| Variant | Behaviour |
|---|---|
| Compact | content height, 24px padding (homepage) |
| Landscape | 16:9 from a 720px viewport; auto height below so text never clips; type scales with card width, clamped h3…h1 (Tamil) and body-l…h2 (English) |
| Square | 1:1; all measurements in `cqi` so the preview is a scale model of the 1080×1080 PNG; 64/1080 safe margin |
| Portrait | 4:5 (1080×1350), same rules as square |

Square and portrait are export compositions. At phone width their metadata is very small on screen (≈8px at 358px wide, 24px in the PNG); use compact or landscape for on-screen reading.

## Tokens
`--verse-*`, `--gradient-*`, `--texture-grain*`, `--color-text-on-gradient`, `--color-glass-fill/-edge`, `--font-stack-*-scripture`, `--radius-xl`, `--shadow-2`.

## Accessibility
- Figure named "Today's verse"; each blockquote has its `lang`.
- All text ink-900 on every preset (worst case 6.55:1 on Andhi with grain). Verified by axe in the browser suite.
- The rule and export guide are `aria-hidden`.
- Forced-colours mode drops the gradient and grain.

## Tests
Unit: placeholder chip, Tamil first, translations, credit, single-language modes, fallback, actions outside the node. Browser: radius 28, every text colour ink-900, static (no animation), split side-by-side only when wide, 1:1 and 4:5 ratios, axe contrast, visual baselines (compact, square, split).

## Phase 5 (not yet built)
PNG export after fonts load (grain included, 1080px wide for social sizes, 2× for on-screen), Web Share with file where supported, otherwise WhatsApp link + Download PNG. Never promise an auto-attached image.
