---
name: nl-tag-seo
description: Use for NLTAG metadata, canonicals, hreflang, sitemap, robots, structured data, local and multilingual SEO, and Core Web Vitals.
---

# NLTAG SEO

## Status
Pre-launch: every route is `noindex, nofollow` (root layout metadata) until Gate 7 authorises launch. Full SEO is implemented in Phase 5 and verified in Phase 6.

## Rules
- Public pages server-rendered; unique title and description per page and per language.
- Locale URLs `/ta/...` and `/en/...`; self-referencing canonicals; `hreflang` alternates for ta, en and `x-default` (→ `/ta`); localized URLs in the sitemap. Only pair pages that have a genuine translation.
- Private routes (member, admin, design-system gallery) always `noindex` and excluded from the sitemap.
- Structured data must be truthful: church name "New Life Tamil AG Church", no invented address, coordinates, ratings or opening hours. Service times only from the confirmed schedule. No Google Business Profile claims unless supplied.
- No Instagram links unless the church supplies a verified account.
- Performance: do not lazy-load the LCP element; Tamil fonts are not preloaded yet (see the fonts note in the Phase 2 report) — measure LCP on `/ta` and preload the display face if it is the LCP text.

## Workflow (Phase 5+)
1. Metadata API per route (`generateMetadata`), with `alternates.languages`.
2. `app/sitemap.ts`, `app/robots.ts`; flip `robots` to indexable only at launch.
3. JSON-LD via a small server component; validate with Google's Rich Results Test and Schema.org validator.
4. Lighthouse/PageSpeed for `/ta` and `/en` on mobile; record results honestly in `docs/seo/`.

## Escalate
Domain/canonical-host decisions, redirects from the existing nltagkuwait.com site, anything that changes indexing before launch.
