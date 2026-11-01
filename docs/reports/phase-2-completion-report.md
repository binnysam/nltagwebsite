# Phase 2 completion report — NLTAG design system

**Date:** 1 November 2026 · **Status:** complete; spinner decision applied; Tamil approved (1 Nov 2026) · **Phase 3:** not started (awaiting migration-plan approval)

Base: commit `7e8a14c` (Phase 2). Changes in this review pass are uncommitted working-tree changes; nothing was pushed.

## 1. Node.js version

| Item | Before | After |
|---|---|---|
| `.nvmrc` | `22` | `22.23.4` |
| `package.json` / `package-lock.json` `engines.node` | `>=20.9.0` | `>=22.22.2 <23` |

- **Why 22.23.4:** the version this review ran on (all checks below). It satisfies every `engines` range in the lockfile (443 packages); `npm ci` reports no `EBADENGINE` warnings.
- **Why the 22.22.2 floor:** the strictest locked ranges are `^22.22.2 || ^24.15.0 || >=26` (jsdom 30.1.3, w3c-xmlserializer 6.0.0, @asamuzakjp/css-color, @asamuzakjp/dom-selector), then undici `>=22.19.0`, tr46 / whatwg-url / data-urls `^22.14.0`. All are dev/test dependencies. The production runtime (Next.js 16.4.3, React 19.3.1) needs only ≥ 20.9.
- **`<23`:** keeps local work and Hostinger's version detection (it reads `engines`) on the 22.x LTS line.
- **Hostinger Business:** Node.js web apps are available on Business Web Hosting; selectable versions are 18.x, 20.x, 22.x (LTS) and 24.x. Hostinger publishes only the major line, not the patch it runs. In hPanel, select **22.x**. If Hostinger's 22.x patch is below 22.22.2, `next build` / `next start` still work (runtime needs ≥ 20.9); only test tooling would warn (npm does not enforce `engines` by default). No hosting plan change.

## 2. Component token additions (for approval)

`tokens.css` is unchanged. All additions are in `component-tokens.css` (layer 3).

| Token | Value | Used by | Why it is needed | Phase 1 impact |
|---|---|---|---|---|
| `--leading-control` | 1.4 | Button, LanguageSwitch, TextField | Phase 1 gives label sizes (14px/500) but no line height for one-line controls; 1.4 keeps labels inside the approved 44/48px heights | None. Heights, sizes and weights are as approved |
| `--icon-size` | 20px | `.ds-icon` (menu, share, download) | Phase 1 has no icon size | None. Icons use the approved `ink-400`/current colour |
| `--icon-size-small` | 14px | Hero pause glyph, badge-adjacent icons | Matches the 14px small text | None |
| `--badge-dot-size` | 6px | StatusBadge, verse placeholder chip | Phase 1 specifies "dot + word" but no dot size | None. Colours remain 700-on-50 |
| `--badge-padding-block` | 2px | StatusBadge, SpecialMeetingCard pill, verse chip | Pill vertical padding for 13px text | None |
| `--spinner-size` / `--spinner-stroke` | 16px / 2px | Button loading state | Phase 1 specifies "loading (spinner + label)" but no size | None. The ring is static (see below) |
| ~~`--motion-spinner-cycle`~~ | removed | — | Owner chose option 2 (static indicator) | None |
| `--z-behind` / `--z-base` / `--z-raised` / `--z-header` / `--z-menu` / `--z-skip-link` | −1 / 0 / 1 / 10 / 20 / 30 | Gradient layer, verse content, sticky header, skip link | Phase 1 requires z-index from tokens (§2) but defines no scale. `--z-header: 10` matches the Phase 1 preview board | None. `--z-base` and `--z-menu` are currently unused; they are kept for the mobile menu and Phase 3 |
| `--verse-social-text-ta` / `-en` / `--verse-social-meta` | 4.2 / 3.4 / 2.2 cqi (≈ 45 / 37 / 24px at 1080) | Verse card, square and portrait | Phase 1 §7.3 requires social sizes to scale by card width but gives no type sizes | None. Fonts, leading, measures, margin and colours are as approved |
| `--verse-landscape-text-ta` / `-en` | 3 / 2.4 cqi, clamped to h3–h1 and body-l–h2 | Verse card, landscape | Fluid type for the 16:9 card so text does not clip (§7.3) | None. Clamped to approved type tokens |

**Resolved — spinner rotation (owner chose option 2).** Phase 1 §8.1 says "No … looping motion outside the hero", and §6 specifies a button loading state of "spinner + label". A rotating spinner is a loop. Options:
1. Approve the rotation as a functional status indicator. It is short-lived and fully off under reduced motion. This is the current implementation.
2. Keep the spinner static (a still ring next to "Please wait…"). Remove `--motion-spinner-cycle`. **← chosen.**

Applied: the `@keyframes spin` rule, the `--motion-spinner-cycle` token and its reduced-motion override are removed. The ring is a still 16px partial circle beside the button label; `aria-busy` and the screen-reader loading text are unchanged. New guards: `tests/unit/motion-policy.test.ts` fails if any `@keyframes` appears outside an allow-list (empty until the Phase 3 hero), and the browser test asserts the ring has `animation-name: none` and no transform. Docs and the `nl-tag-motion-system` skill now state there are no looping exceptions outside the hero.

**Borderline values, not marked `[ADDITION]`.** Both trace to Phase 1, but not to the written specification:
- `--header-height` 64px comes from the Phase 1 preview board (`phase1-preview/preview.css`). §6 lists the header contents but not its height.
- `--grain-tile-size` 220px restates the size of the approved grain tile in `--texture-grain`.

## 3. Verification (Node 22.23.4, npm 10.9.9, Chromium via Playwright 1.64.1) — rerun after the spinner change

| Check | Result |
|---|---|
| `npm ci` (clean `node_modules`) | Pass. 443 packages, no engine warnings |
| `npm run audit:tokens` | Pass. 49 files, 0 errors, 0 warnings, 1 reviewed exception (`themeColor` literal) |
| `npm run review:tamil:check` (new) | Pass. Review sheet in sync, 48 items |
| `npm run lint` | Pass. 0 problems |
| `npm run typecheck` | Pass |
| `npm run test` | Pass. 38 of 38 tests in 5 files (36 previous, 2 new motion-policy tests) |
| `npm run build` (production) | Pass. `/ta`, `/en` prerendered; `/ta/design-system` and `/en/design-system` return 404 without the gallery flag |
| Playwright, both viewports | Pass. 53 passed, 1 skipped by design (mobile menu test at 1280). Loading-button test now also checks the ring is static |
| Production smoke test (`next start`) | `/` → 307 to `/ta`; security headers present; `robots: noindex, nofollow` |
| `npm audit --omit=dev` | 0 vulnerabilities |

No test, axe rule or audit rule was weakened. One audit finding came up during this pass: a `390px` in a reviewer note was flagged as a raw length. The note was reworded; the rule was not changed.

**Unit tests (36):** Button ×5, TextField ×2, MembershipStatusBadge, LanguageSwitch, SiteHeader ×3, ScheduleList, VerseCard ×4, SectionIntro/SpecialMeetingCard, token audit ×3, approved tokens file ×2 (byte-identical to the Phase 1 file; five gradient presets only), schedule Gate 0 ×4, interface strings ×2, Bible placeholder, locale helpers ×2, Tamil review gate ×4 (new).

**Browser tests (per viewport):** both locales: no horizontal scroll, `lang`, page background; axe WCAG 2.0, 2.1 and 2.2 AA with no violations; 44px targets; approved faces only. Specifications: primary button; secondary, compact, loading and disabled buttons; form field; verse card radius, ink and order; split layout; 1:1 and 4:5 ratios; reduced motion zeroes tokens; motion tokens apply; sticky header. Tamil display typography; Latin digits in Tamil text; mobile menu (390 only); root redirect; noindex; unknown locale 404. Visual baselines: verse-compact, verse-square, verse-split, schedule.

## 4. Tamil review — approved 1 November 2026

- **All 48 items are approved** (`confirmed`). The owner supplied the final Tamil for 22 items and approved the other 26 as recommended. No item remains `draft-review`.
- The 22 owner-supplied strings are recorded in `src/content/tamil-approvals.ts` with their previous drafts, and are reproduced exactly as supplied. `tests/unit/tamil-review.test.ts` compares each one character by character, and checks that the 26 recommended drafts are unchanged.
- `docs/content/tamil-content-review.md` is now the approval record (approved Tamil, how it was approved, previous draft). It is still generated from the source and checked by `npm run verify`.
- Alternatives and the short CTA alternative were removed from the source: the decisions are made. `cta.joinFriday` uses the owner's Tamil, ஆராதனையில் இணைந்துகொள்ளுங்கள்.
- **Owner decision that changed a guard:** Sunday School's approved Tamil is ஞாயிறு பள்ளி. The old test that rejected "ஞாயிறு" in the name now checks the exact approved name and that the schedule still says Friday (வெள்ளிக்கிழமை), never ஞாயிற்றுக்கிழமை.
- **Not yet in the record:** weekday names, ஒவ்வொரு / ஒவ்வொரு மாதத்தின் கடைசி, தனித்தனியாக அறிவிக்கப்படும், சபை அங்கத்தினர்களின் வீடுகளில், நிகழ்ச்சியைப் பொறுத்து, and Intl month names. These were never among the 48 and are listed at the end of the record for confirmation.
- **Historical copies left unchanged:** `docs/reference/NLTAG-PHASE-1-VISUAL-FOUNDATIONS.md` §9 and `phase1-preview/` keep the Phase 1 drafts as approved Phase 1 artefacts. The approval record supersedes them.

## 5. Completed components

- **Primitives:** Container, Section, Stack, Cluster, Grid, Divider, Surface, Heading, Text, Icon, VisuallyHidden, Spinner
- **Components:** Button (with ButtonLink and IconButton), LanguageSwitch, TextField, StatusBadge (MembershipStatusBadge), GradientSurface (static), VerseCard (compact, landscape, square, portrait; editorial and split), ScheduleList, SectionIntro, SpecialMeetingCard, SiteHeader (with mobile menu)
- **Infrastructure:** token audit, Tamil review generator and check, private gallery (404 in production), ten NLTAG Claude skills, design-system documentation

## 6. Remaining issues

1. ~~Spinner rotation~~ — resolved: static (§2).
2. ~~Draft Tamil in builds~~ — resolved 1 Nov 2026: all 48 items approved (§4). The formatter phrases listed in §4 still need confirmation before public launch.
3. **Hostinger's 22.x patch is not published.** Confirm it in hPanel at deployment time (§1).
4. **Dev tooling advisories.** `npm audit` reports 16 moderate findings, all in dev tooling (minimatch via eslint-config-next). There are none in production dependencies. Fixing them needs `--force` and breaking upgrades, so they were not changed. eslint 9.39.5 also prints a deprecation notice.
5. **Linux-only visual baselines.** The four baselines are Linux snapshots. Running `test:e2e` on macOS will create new `-darwin` baselines instead of comparing. Run browser tests on Linux or in CI.
6. **Low-end Android check.** The hero still needs a check on a real low-end Android phone (Phase 1 §8.2), in Phase 3.
7. **Local folder.** The folder on the owner's Mac (`NLTAGWebsite/nltagwebsite`) holds an older create-next-app scaffold, not this Phase 2 code. Its uncommitted `package.json` points to Next canary and React RC builds. It was not modified.

## 7. Confirmations

- **Phase 1 tokens are unchanged.** `src/design-system/tokens/tokens.css` is identical to commit `7e8a14c`. SHA-256: `909a67ca886c7ea543dddefa4cfc3388546a41e2397a7fb141d49ec1769edf58`. All 149 non-texture declarations match the approved `claude/tokens.final.css`, and the existing test asserts byte identity.
- **No out-of-scope work.** No CMS, membership, homepage, hero motion (Phase 3), deployment, GitHub push or commit work was started. No dependency was added or upgraded.

## Files changed in this pass

`.nvmrc`, `package.json`, `package-lock.json` (root `engines` only), `README.md`, `.claude/skills/nl-tag-hostinger-deployment/SKILL.md`, `scripts/tamil-review.ts`, `src/content/ui-strings.ts` (`taShortAlternative` field and CTA note), `docs/content/tamil-content-review.md` (regenerated), `tests/unit/tamil-review.test.ts` (new), `docs/reports/phase-2-completion-report.md` (new).

Spinner change: `src/design-system/primitives/layout.module.css`, `Layout.tsx`, `src/design-system/tokens/component-tokens.css` (token removed), `src/design-system/components/Button/Button.tsx` and `button.module.css` (comments), `tests/unit/motion-policy.test.ts` (new), `tests/e2e/design-system.spec.ts` (static-ring assertion), `docs/design-system/{motion/motion.md, tokens/token-reference.md, components/button.md, components/other-components.md, accessibility/accessibility.md}`, `.claude/skills/nl-tag-motion-system/SKILL.md`.
