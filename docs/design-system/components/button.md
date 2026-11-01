# Button, ButtonLink, IconButton

| | |
|---|---|
| Category | Atom · action |
| Status | Implemented (Phase 2) |
| Source | `src/design-system/components/Button/` |
| Spec | Phase 1 §6 Button |

## When to use
- **Button** performs an action on the page (share, download, submit).
- **ButtonLink** navigates ("Join us this Friday", "Worship times"). Never put a navigation in a `<button>`.
- **IconButton** for a 44×44 icon-only control (menu, pause). Always pass `label`.
- One primary action per region. Use secondary for the rest; tertiary for low-emphasis text actions.

## Anatomy
Pill container · optional leading icon (decorative) · label · optional static loading ring (loading) · hidden loading text.

## Tokens
`--control-height`, `--button-padding-inline(-compact)`, `--button-padding-block`, `--button-font-size`, `--font-weight-medium`, `--leading-control`, `--radius-pill`, `--color-action-primary(-hover/-pressed)`, `--color-text-inverse`, `--color-surface-card/-subtle/-sunken`, `--color-border-strong`, `--color-glass-fill-solid`, `--color-glass-edge`, `--color-text-disabled`, `--motion-duration-fast/-instant`, `--motion-ease-standard`, `--motion-scale-press`, focus tokens.

## API
| Prop | Type | Default | Notes |
|---|---|---|---|
| `variant` | `"primary" \| "secondary" \| "tertiary" \| "glass"` | `"primary"` | `glass` only over gradients |
| `compact` | boolean | false | 16px padding; height stays 44px |
| `fullWidth` | boolean | false | |
| `icon` | ReactNode | — | Leading, decorative |
| `loading` (Button) | boolean | false | Static ring, `aria-busy`, presses ignored, focus kept |
| `loadingLabel` (Button) | string | — | Appended to the accessible name while loading |
| `disabled` (Button) | boolean | false | Native disabled |
| `href` (ButtonLink) | string | required | Internal paths use `next/link` |
| `label` (IconButton) | string | required | Accessible name |
| `ref` (IconButton) | Ref | — | For focus return |

## States
| State | Primary | Secondary | Tertiary | Glass |
|---|---|---|---|---|
| Default | ink-900 fill, white text | white, line-18 edge | underlined text | 72% white, glass edge |
| Hover | ink-800 | paper-100 | 2px underline | white |
| Pressed | ink-1000 + scale 0.98 | paper-200 + scale | scale | scale |
| Focus-visible | 2px blue-700 ring, 3px offset (all) ||||
| Loading | static ring + label (no rotation), `aria-busy="true"` ||||
| Disabled | paper-200 fill, ink-400 text, no press ||||

## Keyboard and accessibility
Native `<button>`/`<a>` semantics; Enter/Space activate. Visible label is the accessible name. Loading keeps focus so keyboard users are not lost. Disabled buttons use native `disabled` (not focusable). Text colour never carries meaning alone.

## Responsive
Labels wrap rather than truncate; the pill grows taller (Tamil "Join us this Friday" wraps on 390px; see the Tamil review sheet). Use `fullWidth` in narrow stacks.

## Example
```tsx
<ButtonLink href="/ta/worship-times">{t("cta.joinFriday", locale)}</ButtonLink>
<Button variant="secondary" compact icon={<Icon name="share" />} onClick={share}>{t("verse.share", locale)}</Button>
<Button loading loadingLabel={t("form.loading", locale)}>{t("verse.download", locale)}</Button>
<IconButton label={t("nav.menu", locale)} icon={<Icon name="menu" />} />
```

## Tests
`tests/unit/components.test.tsx` (behaviour, names, axe) · `tests/e2e/design-system.spec.ts` (computed colours, sizes, hover, focus ring, motion tokens).

## Related
SiteHeader (CTA, menu button), VerseCardActions, SectionIntro (one CTA).
