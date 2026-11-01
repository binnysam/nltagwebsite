# NLTAG website

Website for New Life Tamil AG Church, Kuwait. Next.js (App Router) + React + TypeScript, bilingual Tamil (default) and English, built on the NLTAG design system. Target hosting: Hostinger Business (Node.js).

**Status:** Phase 2 — design system implemented. No church pages, CMS or membership yet. Every route is `noindex`.

## Requirements
Node 22 (`.nvmrc`; Next.js 16 needs ≥ 20.9). npm.

## Commands
```bash
npm ci                    # install from lockfile
npm run dev               # local dev at http://localhost:3000 (redirects to /ta)
npm run verify            # token audit, lint, typecheck, unit tests, production build
scripts/serve-gallery.sh  # build WITH the private gallery and serve on :3100
npm run test:e2e          # browser tests at 390px and 1280px (needs the gallery server)
node scripts/tamil-review.ts  # regenerate docs/content/tamil-content-review.md
```
To see the component gallery locally: `NLTAG_DESIGN_SYSTEM_GALLERY=1 npm run dev`, then open `/ta/design-system` or `/en/design-system`. Production builds never set this flag, so the route is a 404 there.

## Layout
```
src/
  app/[locale]/            routes (ta, en); design-system/ = private gallery
  design-system/
    tokens/                tokens.css (approved, locked) + component-tokens.css (layer 3)
    fonts/                 self-hosted OFL fonts via next/font/local
    styles/base.css        reset, language rules, focus, utilities
    primitives/            Container, Section, Stack, Cluster, Grid, Divider, Surface, Heading, Text, Icon…
    components/            Button, LanguageSwitch, TextField, StatusBadge, GradientSurface, VerseCard,
                           ScheduleList, SectionIntro, SpecialMeetingCard, SiteHeader
  content/                 ui-strings (bilingual, review status), schedule (Gate 0), bible (placeholder)
  lib/                     i18n, Kuwait dates, cx
scripts/                   token-audit.mjs, serve-gallery.sh, tamil-review.ts
tests/unit                 Vitest + Testing Library + axe
tests/e2e                  Playwright + axe (real Chrome)
docs/                      design-system specs, content review, reports, reference
.claude/skills/            ten NLTAG Claude skills
```

Start with `CLAUDE.md`.
