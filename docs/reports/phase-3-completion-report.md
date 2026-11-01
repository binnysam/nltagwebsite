# Phase 3 completion report — motion system and homepage hero

**Date:** 1 November 2026 · **Status:** approved by the owner, 1 Nov 2026 (120s cycle, 0.35 field opacity, Tamil preload on both locales) · **Base:** `main` at `317c0cb` · **Branch:** `phase3/hero-motion`
**Not started:** CMS, membership, the rest of the homepage (Phase 5), deployment.

## 1. What was built

- **`Hero` component** (`src/design-system/components/Hero/`): the only animated gradient on the site. Spec: `docs/design-system/components/hero.md`.
  - **Five approved presets** crossfade by opacity, Vaigarai → Andhi → Kadal → Thalir → Manal → Vaigarai. Order chosen so neighbours share a hue family. 24s per preset (≈17s hold, ≈7s crossfade), 120s per cycle.
  - **Four approved hero fields** drift with the Phase 1 keyframes (transform only, 48s, alternate) at 0.35 opacity over the presets.
  - Static grain tile on top; base `hero-base` underneath. No `filter`, no `backdrop-filter`.
- **Motion control:** 44px glass icon button, bottom right, pause/play glyph, accessible name from the approved strings `hero.pause` / `hero.play` in the page language. Keyboard: Tab, Enter, Space; focus stays on the button when its name changes. The choice is remembered for the visit.
- **When it moves:** only after hydration, while not paused, while on screen (IntersectionObserver) and when reduced motion is off. Without JavaScript the hero is a still frame and no control is shown, so motion never starts without a working pause (WCAG 2.2.2). Under reduced motion: still Vaigarai frame, control hidden; applies live if the setting changes.
- **Homepage** (`/ta`, `/en`): header with the approved CTA, the hero, and the Gate 0 worship schedule (existing `ScheduleList`). Still `noindex`.

### Placeholder content
Only approved content is used; no new Tamil strings were added.

| Hero slot | Shows | Source |
|---|---|---|
| Line above the heading | Church name in the other language | Official English name; owner-supplied Tamil name |
| Heading (h1) | Church name in the page language | as above |
| Lead | "This website is being prepared." / இந்த இணையதளம் தயாராகி வருகிறது. | Approved string `site.inPreparation` — stands in for welcome copy (CONTENT REQUIRED) |
| Button | "Join us this Friday" / ஆராதனையில் இணைந்துகொள்ளுங்கள் → schedule | Approved `cta.joinFriday` |

## 2. Token changes (for approval)

`tokens.css` is unchanged (SHA-256 `909a67ca…f58`). In `component-tokens.css`:

| Token | Value | Kind |
|---|---|---|
| `--home-hero-surface`, `--home-hero-field-1…4` | aliases of `hero-base`, `hero-field-1…4` | Alias (components may not read primitives) |
| `--home-hero-radius` | `var(--radius-xl)` | Alias |
| `--motion-hero-preset-cycle` | `calc(var(--motion-hero-cycle) * 2.5)` = 120s | **[ADDITION]** — derived from the approved 48s cycle |
| `--home-hero-field-opacity` | 0.35 | **[ADDITION]** — at full strength the warm fields muddied Kadal and Andhi into grey; 0.35 keeps each preset recognisable while the fields still move |

Tried and removed: rendering the colour layers at ¼ size and scaling up. It made software-rendered desktop slower (≈44 vs ≈49 fps across two runs) and gave no measurable gain on the phone profiles, so the extra token was dropped.

**Font loading (small change, flag for review):** Anek Tamil and Noto Sans Tamil are now preloaded. Without it the Tamil heading swapped fonts after first paint and moved the page (CLS 0.080 on a 390px phone). With it: 0.001. Phase 1 §4.1 asked for Tamil preloads on `/ta` only; next/font preloads per layout, so `/en` also downloads these four files (≈64 KB). Alternative if preferred: no preload, accept the shift.

## 3. Verification

Node 22.23.4, npm 10.9.9, Chrome for Testing 153.

| Check | Result |
|---|---|
| `npm run verify` (token audit, Tamil record, lint, typecheck, unit tests, production build) | Pass. Audit 0 errors, 0 warnings; Tamil record in sync (48); 44 unit tests in 6 files |
| Browser suite, 390 and 1280 | Pass. 87 passed, 1 skipped by design (mobile menu at 1280). Hero suite rerun twice more: 34/34 each time |
| Production smoke test (`next start`, no gallery flag) | `/` → 307 `/ta`; security headers; `noindex, nofollow`; hero server-rendered with `data-ready="false"`; `/ta/design-system` 404 |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `tokens.css` SHA-256 | `909a67ca886c7ea543dddefa4cfc3388546a41e2397a7fb141d49ec1769edf58` (unchanged) |

### New tests
- `tests/e2e/hero.spec.ts` (×2 viewports): only transform/opacity animate and only the two approved animations exist; nothing else on the page animates; pause by keyboard with visible focus ring, label in the page language, remembered after reload, resume; axe WCAG 2.2 AA while moving and while paused, both locales; **contrast across the whole cycle** (40 points, darkest background pixel behind each text element) — worst case **8.62:1** (phone) / 8.71:1 (desktop), threshold 6:1; reduced motion (no animations, Vaigarai, no control) including a live switch; no-JavaScript still frame; pauses off screen and resumes; no layout shift from motion or the control; control never overlaps content; still-frame visual baseline.
- `tests/unit/hero.test.tsx`: section named by its heading, decorative layers hidden, five presets in order, toggle and session memory, axe.
- `tests/unit/motion-policy.test.ts`: `@keyframes` allowed only in `Hero/hero.module.css`; exactly the two hero animations; keyframes change only opacity/transform; no filter/backdrop-filter; reduced-motion and hydration gating present; hero presets equal the five approved presets.

### Performance (headless Chrome, GPU disabled — harsher than a phone's GPU; 5s traces)

| Profile | Running | Paused | Reduced motion |
|---|---|---|---|
| Phone 390px, 3× DPR, CPU 4× slower | 60 fps (p95 16.7 ms) | — | — |
| Phone 390px, 3× DPR, CPU 6× slower | 60 fps, 0 dropped frames (301 drawn) | 0 frames drawn | 0 frames drawn |
| Desktop 1280px, software rendering | ≈53 fps (264 drawn, 37 dropped) | 0 frames drawn | 0 frames drawn |

- During motion: 0 ms layout and 0 ms paint on the main thread (compositor-only).
- Phase 1 reference (§8.2): 60 fps phone, ≈48 fps software desktop. Phase 3 matches or beats it with the extra preset layers.
- CLS: 0 after load (motion and control); 0.001 during load (font swap).

## 4. Previews
Desktop (1280) and phone (390) stills of every preset, the paused state with keyboard focus, full pages in Tamil and English, and an 8× sped-up recording of one full cycle on each viewport were produced for review (sent with this report; not committed).

## 5. Real low-end Android check — still open
No physical Android device was available to this session. Emulated profiles pass (above). To close pre-launch item 10 once a preview build is reachable from a phone:
1. Open `/ta` on a low-end Android phone (e.g. 2–3 GB RAM, Chrome current).
2. Watch for at least one full cycle (2 minutes): motion should look continuous, with no stutter while scrolling the schedule.
3. Tap pause: motion stops immediately; reload: still paused; tap play: resumes.
4. Turn on *Remove animations* (Settings → Accessibility): the hero is still, no control.
5. Optional: Chrome remote debugging → Performance panel, 10s recording: frames ≥ 55 fps, no long tasks from the hero.

## 6. Remaining items
1. ~~Owner sign-off on the two token additions and the font preload (§2).~~ Approved 1 Nov 2026.
2. Real low-end Android check (§5; pre-launch item 10). Owner: stays on the pre-launch checklist; does not block Phase 4.
3. Hero welcome copy is CONTENT REQUIRED (pre-launch item 12).
4. Branch `phase3/hero-motion` pushed and opened as a PR against `main` after approval.

## Files
New: `src/design-system/components/Hero/{Hero.tsx, Hero.client.tsx, hero.module.css, index.ts}`, `src/content/church.ts`, `src/app/[locale]/home.module.css`, `docs/design-system/components/hero.md`, `docs/reports/phase-3-completion-report.md`, `tests/e2e/hero.spec.ts` (+ 2 baselines), `tests/unit/hero.test.tsx`.
Changed: `src/app/[locale]/page.tsx`, `src/design-system/components/index.ts`, `src/design-system/tokens/component-tokens.css`, `src/design-system/fonts/fonts.ts`, `tests/unit/motion-policy.test.ts`, `docs/design-system/{README.md, motion/motion.md, tokens/token-reference.md, accessibility/accessibility.md, components/other-components.md}`, `docs/reports/pre-launch-approval-checklist.md`, `.claude/skills/nl-tag-motion-system/SKILL.md`, `CLAUDE.md`.
