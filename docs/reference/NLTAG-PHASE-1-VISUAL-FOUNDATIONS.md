# NLTAG Phase 1 — Visual Foundations (Final Package)

**Status:** Final package, awaiting the owner's final Phase 1 approval. Gate 1 decisions (1 Nov 2026) applied. Nothing is implemented in application source code.
**Visual board:** "NLTAG Foundation Package" (private review page). Earlier board "NLTAG Visual Foundations" is kept as the proposal record.
**Tokens:** `claude/tokens.final.css` (replaces `tokens.proposal.css`).
**Authority:** Gate 0 decisions → this document → master prompt → `LLM-DESIGN-SYSTEMS.md` → `warm-editorial-bento-ui-skill.md`.

---

## 0. Gate 1 decisions applied

| Topic | Decision | What changed in this package |
|---|---|---|
| Typography | Option A approved | Anek Tamil 300 for display-xl/l (≥ 32px), 400 for h1–h3, schedule names and card titles. Fallbacks documented (§4.2). |
| Verse card | Editorial A primary, Split C alternative | Iravu and Centred B removed. Actions outside the artwork. Placeholder text only. |
| Gradients | Keep Vaigarai, Manal, Kadal, Andhi, Thalir | Iravu removed from tokens and board. |
| Palette and shape | Approved with refinements | Three contrast refinements (§3.3). Radius 20 / 28 / pill retained. |
| Targets | Prefer 44px everywhere | 36px compact size removed. Compact buttons keep 44px height, only padding shrinks. Language switch and nav links have 44px hit areas. |
| Terminology | Review required | Bilingual schedule preview with recommended Tamil terms and alternatives (§9). Nothing approved or published. |
| Motion | Approved | Hero tested on throttled phone profile; hero rebuilt for performance (§8.2). |

## 1. Direction
Warm paper surfaces and warm-charcoal ink carry every page. Colour appears only in the homepage hero (one slow animated gradient with a pause control), the Bible Verse Showcase Card and event artwork (static gradients with grain). Tamil is the default language with its own line heights and no English tracking rules. Scripture is the one place a serif face appears. Light mode only at launch; tokens remain theme-ready.

## 2. Token architecture
Three layers, as `LLM-DESIGN-SYSTEMS.md` requires:
1. **Primitive** — `paper-*`, `ink-*`, `line-*`, status 700/50 pairs, glass fills, gradient stops.
2. **Semantic** — `color-surface-*`, `color-text-*`, `color-border-*`, `color-action-*`, `color-focus-ring`, `color-status-*`.
3. **Component** — added in Phase 2 only where justified (e.g. `verse-card-*`).
Components reference layers 2–3 only. The Phase 2 token audit will fail on raw hex/rgb, px spacing, radii, shadows, durations and z-index outside the token file.

## 3. Colour

### 3.1 Primitives
| Token | Value | Role |
|---|---|---|
| paper-0 | #FFFFFF | card surface |
| paper-50 | #FAF8F5 | page |
| paper-100 | #F3EFE9 | subtle surface, hover |
| paper-200 | #E9E3DA | sunken, disabled fill |
| ink-1000 | #000000 | pressed primary only |
| ink-900 | #1C1915 | primary text, primary action, all text on gradients |
| ink-800 | #34302A | primary hover |
| ink-700 | #3B352E | strong secondary text |
| ink-500 | #655D53 | secondary text (paper surfaces only) |
| ink-400 | #8A8175 | control borders, icons, disabled text; never body text |
| line-10 / line-18 | rgba(60,42,24,.10 / .18) | dividers, card edges / secondary button edge, rules |
| status 700/50 | green #2E6A4C/#EAF2EC · amber #8A5410/#F7EEDF · red #A3392A/#F8E9E5 · blue #2C5878/#E7EFF4 | badges, alerts, always with a word |
| glass-fill / glass-fill-solid / glass-edge | white 55% / 72% / 70% | pills over gradients |

### 3.2 Contrast matrix (WCAG 2.x, measured 1 Nov 2026)
| Foreground | paper-0 | paper-50 | paper-100 | paper-200 | Result |
|---|---|---|---|---|---|
| ink-900 | 17.51 | 16.52 | 15.29 | 13.73 | AA/AAA |
| ink-700 | 12.11 | 11.42 | 10.57 | 9.49 | AA/AAA |
| ink-500 | 6.47 | 6.11 | 5.65 | 5.08 | AA |
| ink-400 (UI only) | 3.83 | 3.62 | 3.35 | 3.01 | ≥ 3:1 non-text |
| blue-700 focus ring | 7.57 | 7.14 | 6.61 | 5.93 | ≥ 3:1 non-text |

- Primary button: white on ink-900 17.51; on ink-800 hover 13.11.
- Status text on own fill: info 6.51, success 5.61, warning 5.44, error 5.60.
- Gradients, worst case (darkest stop with grain applied): ink-900 ≥ 6.55 (Andhi lowest); ink-700 ≥ 4.53; ink-500 ≥ 2.42 (fails). Glass pills ≥ 11.7.

### 3.3 Refinements from validation
1. **All text on gradients is ink-900**, including metadata (`color-text-on-gradient`). ink-700 passed only by a hair on Andhi once grain is included.
2. **Form controls use `color-border-control` (ink-400).** The 18% hairline measured 1.41:1 and fails WCAG 1.4.11 for input boundaries. Cards and dividers keep line-10 (decorative). Secondary buttons keep line-18 because the visible label identifies the control.
3. **Corrected figures:** status pairs are 5.4–6.5:1 (proposal said 5.9–7.1); the gradient metadata figure of 6.2:1 held only without grain.

### 3.4 Gradient presets (static)
| Preset | Meaning | Default use | ink-900 worst case |
|---|---|---|---|
| Vaigarai வைகறை | first light | default verse card | 7.30 |
| Manal மணல் | desert sand | events | 7.08 |
| Kadal கடல் | the Gulf | verse, events | 7.06 |
| Andhi அந்தி | dusk | verse, events | 6.55 |
| Thalir தளிர் | new shoot ("New Life") | verse, events | 7.96 |

Grain: deterministic pre-rendered SVG `feTurbulence` tile (seed 7), multiply blend at 0.32 opacity. No live filter on large surfaces; fallback is the plain gradient. Iravu removed.

## 4. Typography (Option A)

### 4.1 Families
| Role | Face | Weights loaded |
|---|---|---|
| Tamil display | Anek Tamil | 300, 400 |
| Tamil body | Noto Sans Tamil | 400, 500 |
| English display | Inter Tight | 300, 400, 500 |
| English body | Inter | 400, 500 |
| Scripture | Noto Serif Tamil 400 + Newsreader 400 | verse card only |

All SIL OFL. Self-hosted via `next/font` with only the listed weights and the `tamil` + `latin` subsets, `display: swap`, size-adjusted fallbacks. Tamil faces preload on `/ta` pages only. *(Superseded 1 Nov 2026, owner-approved in Phase 3: next/font preloads per layout, so the above-the-fold Tamil faces preload on both locales — CLS 0.080 → 0.001 at 390px.)*

### 4.2 Fallback stacks
- Tamil display: Anek Tamil → Noto Sans Tamil → Tamil Sangam MN → Nirmala UI → Latha → sans-serif
- Tamil body: Noto Sans Tamil → Tamil Sangam MN → Nirmala UI → Latha → sans-serif
- Tamil scripture: Noto Serif Tamil → Tamil Sangam MN → Nirmala UI → serif
- English display: Inter Tight → Inter → system-ui → -apple-system → Segoe UI → sans-serif
- English body: Inter → system-ui → -apple-system → Segoe UI → Roboto → sans-serif
- English scripture: Newsreader → Iowan Old Style → Georgia → Times New Roman → serif

### 4.3 Scale
| Token | English | Tamil | EN line height / tracking | TA line height |
|---|---|---|---|---|
| display-xl | 40→72px, 300 | 34→60px, 300 | 1.06 / −0.025em | 1.28 |
| display-l | 32→52px, 300 | 28→44px, 300 | 1.06 / −0.025em | 1.3 |
| h1 | 28→40px, 400 | 28→40px, 400 | 1.15 / −0.015em | 1.4 |
| h2 | 22→28px | 22→28px, 400 | 1.2 / −0.01em | 1.45 |
| h3 | 20px | 20px, 400 | 1.3 / 0 | 1.5 |
| body-l | 18px | 18px | 1.6 / +0.005em | 1.8 |
| body | 16px | 17px | 1.6 / +0.005em | 1.8 |
| small / caption | 14 / 13px (floor) | 14 / 13px | 1.5 / +0.01em | 1.7 |

Rules: Tamil never takes negative tracking, uppercase transforms or eyebrow letter-spacing. Measures: English 64ch, Tamil 60ch. Specimens on the board use real schedule content plus the stress string ஸ்ரீ க்ஷ ஜ்ஞ கொ கோ கௌ ழு ளு ற்று ஞ்ச ந்த ண்ட ஷ்ட and Tamil numerals ௧௨௩௪௫.

**Owner check:** the board shows Anek Tamil 300 and 400 side by side at 28px. If 400 is preferred everywhere, change `--font-weight-display-ta-large` only.

## 5. Space, layout, radius, elevation
- Space (4px base): 4, 8, 12, 16, 24, 32, 48, 64, 96, 128. Section padding 64px phone, 96–128px desktop.
- Breakpoints 480 / 768 / 1024 / 1280. Content 1200px, wide 1360px, gutter 16→32px. 12-column grid, 16px gap (24px from 1024).
- Minimum interactive target: 44 × 44px.
- Radius: pill (actions, chips, switches), 8 (inner), 12 (inputs), 20 (cards), 28 (hero, verse card).
- Elevation: shadow-1 resting, shadow-2 hover / verse card, shadow-3 dialogs and menus. Warm-tinted, always paired with a line-10 hairline.
- Bento only where content weights differ. Schedules and forms are single-column lists.
- Decorative layers (gradients, grain, colour fields) never take pointer events and never sit inside a control.

## 6. Component visual specifications (visual only; behaviour, props and tests in Phase 2)
| Component | Specification |
|---|---|
| Header | Wordmark left (NLTAG, Inter Tight 500, +0.08em), Tamil-first links with 44px hit areas, language switch, one ink pill CTA ("Join us this Friday"). White surface, shadow-1 when sticky. |
| Button | Pill, 44px min height, 20px padding (16px compact), 14px/500. Primary ink-900 → hover ink-800 → pressed ink-1000 + scale 0.98. Secondary white + line-18 edge → hover paper-100. Tertiary underlined. Glass only over gradients. States: default, hover, focus-visible (2px blue-700, 3px offset), pressed, loading (spinner + label), disabled (paper-200 / ink-400). |
| Language switch | Segmented pill on paper-100, segments ≥ 38px inside a 44px control, selected segment white + shadow-1, `aria-pressed`. |
| Form field | Label 14px/500 above, 48px input, radius 12, ink-400 edge, hover ink-700, focus ring + ink-900 edge, error 2px red-700 edge + message in words, disabled paper-100 fill. Hint 13px ink-500. |
| Status badge | Pill, 13px/500, dot + word, 700 text on 50 fill. Membership states: Draft, Email verified, Pending review, Correction requested, Active, Rejected (Tamil labels are drafts). |
| Schedule list | Editorial rows divided by line-10; columns name / when / where, stacking under 680px. Name in Anek Tamil 400 with the other language beneath in 14px ink-500. Tabular numerals. Row tint paper-100 on hover. |
| Special meeting card | Caption-anchored: preset gradient art (16:10) with grain and glass type pill, body with date, Tamil title, English title, announcement. CMS-driven; no sample content published. |
| Section micro-hero | Eyebrow (14px ink-500), display-l heading, lead (18px ink-500, 64ch), one pill CTA, then content. |

## 7. Bible Verse Showcase Card

### 7.1 Compositions
- **A Editorial (primary):** left-aligned; brand line and date; Tamil verse; 40px line-18 rule; English verse; metadata at the foot.
- **C Split (alternative):** Tamil and English panes side by side with a line-18 divider when the card is ≥ 620px wide; stacked (Tamil first) below that.

### 7.2 Anatomy and rules
- Tamil first, English beneath; serif scripture faces only here.
- Reference, translation labels (BSI Tamil — edition to confirm; NKJV) and publisher credit line always visible.
- Placeholder chip and clearly labelled placeholder text until reproduction permission is confirmed. No Scripture is fabricated.
- All text ink-900 on every preset (≥ 6.55:1 worst case).
- Static preset gradient, radius 28, shadow-2, grain as §3.4.
- Share and Download PNG actions sit outside the card node and are never exported.

### 7.3 Type
Tamil: Noto Serif Tamil 400, line height 1.75, max 34ch. English: Newsreader 400, line height 1.45, max 40ch. Metadata 13px. In social sizes every measurement is a percentage of card width (container query units) so the preview is a scale model of the PNG.

### 7.4 Variants
| Variant | Size | Notes |
|---|---|---|
| Landscape feature | 16:9 | Auto height below 720px viewport so text never clips |
| Compact homepage | content height | 24px padding |
| Square | 1080 × 1080 | 64px export-safe margin |
| Portrait | 1080 × 1350 | 64px export-safe margin |
| Export frame | — | Shows safe margin in preview; not drawn in PNG |

Language modes: both (default), Tamil only, English only (rule hidden with one language).

### 7.5 Export and sharing (behaviour in Phase 5)
PNG from the card node only, after fonts load, grain included, 1080px wide for social sizes and 2× DPR for on-screen sizes. Share uses Web Share with the file where supported; otherwise WhatsApp share URL with page link plus Download PNG. Never promise auto-attached images.

### 7.6 Data integrity
Verse text only from church-approved CMS records (stable ID, reference, text and translation label per language). Daily selection deterministic for the Asia/Kuwait date. If nothing is scheduled, a designed fallback appears instead of invented text.

## 8. Motion

### 8.1 Tokens
| Token | Value | Use |
|---|---|---|
| duration instant / fast / standard / emphasis / slow | 80 / 140 / 220 / 360 / 560 ms | press / colour / hover lift / reveals / large panels |
| hero cycle | 48 s | hero drift only |
| ease standard / enter / exit / ambient | (0.2,0,0,1) / (0.05,0.7,0.1,1) / (0.3,0,0.8,0.15) / (0.45,0,0.55,1) | |
| distance subtle / standard | 8 / 16 px | reveal offsets |
| lift hover / press scale | −2px / 0.98 | cards / buttons |
| stagger | 60 ms, max 4 items | list reveals |

Under `prefers-reduced-motion: reduce` every duration, distance, lift and scale token resolves to zero/neutral, the hero is static and its pause button is hidden. Content is visible without JavaScript. No parallax, scroll-jacking, bounce or looping motion outside the hero. Visible pause control (WCAG 2.2.2).

### 8.2 Hero performance test (1 Nov 2026)
Headless Chrome, GPU disabled (software rendering, harsher than a real phone).

| Profile | As proposed | As refined | CLS |
|---|---|---|---|
| Phone 390px, 3× DPR, CPU 4× slower | 20 fps | 60 fps (p95 16.8 ms) | 0 |
| Phone 390px, 3× DPR, CPU 6× slower | 19 fps | 60 fps (p95 16.7 ms) | 0 |
| Desktop 1280px, software rendering | 9 fps | ~48 fps | 0 |
| Phone, reduced motion | static, 60 fps | static, 60 fps | 0 |

Refinements adopted:
1. Hero colour fields carry their soft edge inside `radial-gradient(closest-side, …)` instead of a live `filter: blur(60px)`. Only `transform` animates.
2. Glass pills over the moving hero use `glass-fill-solid` (72% white) with no `backdrop-filter`. Backdrop blur is allowed only over static gradients.

Still required: a check on a real low-end Android phone once a preview build exists.

## 9. Bilingual church schedule preview (terminology for church review)
Times and places exactly as Gate 0. Tamil names are proposals; nothing is published until approved.

| English | Recommended Tamil | Alternatives | Schedule (Tamil draft) |
|---|---|---|---|
| Main Worship Service | பிரதான ஆராதனை | சபை ஆராதனை · ஆராதனை | ஒவ்வொரு வெள்ளிக்கிழமை, காலை 7:30 – 9:30 · NECK |
| Sunday School | சண்டே ஸ்கூல் | வேதபாட வகுப்பு · ஞாயிறு பள்ளி | ஒவ்வொரு வெள்ளிக்கிழமை, காலை 9:30 – 10:30 · NECK |
| Fasting Prayer | உபவாச ஜெபம் | உபவாச ஜெபக்கூட்டம் | ஒவ்வொரு சனிக்கிழமை, மாலை 7:30 – 8:30 · NECK |
| Cottage Meeting | வீட்டு ஜெபக்கூட்டம் | குடும்ப ஜெபக்கூட்டம் · காட்டேஜ் மீட்டிங் | ஒவ்வொரு செவ்வாய்க்கிழமை, மாலை 7:30 – 8:30 · சபை அங்கத்தினர்களின் வீடுகளில் |
| Ladies Meeting | சகோதரிகள் கூட்டம் | பெண்கள் ஜெபக்கூட்டம் · மகளிர் கூட்டம் | ஒவ்வொரு மாதத்தின் கடைசி வியாழக்கிழமை, மாலை 7:00 – 9:00 · NECK |
| Special Meetings | சிறப்புக் கூட்டங்கள் | விசேஷ கூட்டங்கள் | தனித்தனியாக அறிவிக்கப்படும் · நிகழ்ச்சியைப் பொறுத்து |

Reviewer notes:
- "ஞாயிறு பள்ளி" literally means Sunday; avoid it or pair it with "வெள்ளிக்கிழமை" so it is never read as a Sunday event.
- Confirm who Sunday School is for (children only or all ages).
- Confirm "மாலை" vs "இரவு" for 7:30 PM.
- Cottage Meeting host addresses are never published. NECK is written exactly.

## 10. Final approval checklist
Approving this package confirms:
1. `tokens.final.css`, including the three contrast refinements and the hero performance refinements.
2. Anek Tamil 300 for display sizes, 400 for smaller headings.
3. Editorial A primary, Split C alternative, five static presets.
4. 44px minimum targets.
5. Motion tokens and hero as tested.

Open (does not block Phase 2): Tamil terminology and evening-time wording; Sunday School audience; BSI edition and Bible permissions; membership ID year/reset; email provider; live-site correction access; real-device hero check.

**Phase 2 (design-system implementation in source code) starts only after explicit approval of this package.**
