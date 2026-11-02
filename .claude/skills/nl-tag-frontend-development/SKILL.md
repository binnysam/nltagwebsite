---
name: nl-tag-frontend-development
description: Use for Next.js/React/TypeScript work in the NLTAG site: routes, layouts, data flow, server/client boundaries, i18n routing and performance.
---

# NLTAG frontend development

## Purpose
Build fast, server-rendered, bilingual pages with the existing design system on Next.js (App Router) for Hostinger Business Node.js hosting.

## Use when
Creating or changing routes, layouts, data loading, metadata, client interactivity or build configuration.

## Read first
`CLAUDE.md`, `docs/design-system/patterns/page-composition.md`, the relevant component specs, and the nl-tag-design-system skill for any visual question.

## Stack facts (verify versions before upgrading)
- Next.js 16.4.3, React 19.3.1, TypeScript 6 (strict), Node ≥ 20.9 (`.nvmrc` 22). Pinned exactly; no canary or RC.
- Routes live under `src/app/[locale]/` (`ta` default, `en`); `/` redirects to `/ta`. `[locale]/layout.tsx` is the root layout and sets `<html lang>`.
- Fonts: `src/design-system/fonts/fonts.ts` (`next/font/local`, literal options only).
- Content: interface strings `src/content/ui-strings.ts`; schedule `src/content/schedule.ts`; verses `src/content/bible.ts` (placeholder only).
- Public pages (Phase 5): compose from `src/app/[locale]/_components/` (`PublicShell`, section renderers, `pageMetadata`). CMS data only via `src/server/cms/public-site.ts` loaders (per-request, cached by tag, empty state on failure); never query content tables in a page.

## Workflow
1. Identify routes, roles and data affected. Ask before architecture, security or paid-service changes.
2. Server Components by default; add `"use client"` only for interaction (see `SiteHeader.client.tsx`, `LanguageSwitch`). Never pass functions from Server to Client Components.
3. Compose pages from primitives and components; no new CSS values outside the token rules.
4. Every page: one `<h1>`, `<main id="main">`, metadata via the Metadata API, `noindex` until launch (Gate 7).
5. Every visible string from `ui-strings` (or the CMS later) in both languages; mixed-language spans carry `lang`.
6. Dates through `src/lib/date.ts` (Asia/Kuwait).
7. Run `npm run verify`, then `scripts/serve-gallery.sh && npm run test:e2e`.

## Rules
- No client-only rendering for essential content. Content must be visible without JavaScript.
- No inbound WebSockets or always-running background workers (Hostinger limits); scheduled work uses cron/external triggers.
- Never commit secrets; only variable names in `.env.example`.
- Do not invent church content. Missing content is `CONTENT REQUIRED` and stays unpublished.

## Validation checklist
- [ ] `npm run verify` green
- [ ] Browser suite green at 390px and 1280px
- [ ] No horizontal scroll at 390px
- [ ] Both locales render and the language switch keeps the page

## Escalate
Framework upgrades, new dependencies with runtime cost, changes to routing strategy, anything touching auth, data or deployment.
