# CLAUDE.md — NLTAG website

New Life Tamil AG Church (NLTAG), Kuwait. Bilingual (Tamil default `/ta`, English `/en`) Next.js site with an LLM-readable design system. Light mode only at launch.

## Source hierarchy (highest first)
1. Owner gate decisions (Gate 0, Gate 1 in the claude.ai project "NLTAGWebsite"; summary in `docs/reference/README.md`)
2. `docs/reference/NLTAG-PHASE-1-VISUAL-FOUNDATIONS.md` and `src/design-system/tokens/tokens.css` (approved)
3. `NLTAG-CHURCH-CLAUDE-MASTER-PROMPT.md`
4. `LLM-DESIGN-SYSTEMS.md` — read it before any UI work
5. `warm-editorial-bento-ui-skill.md`
Report conflicts; never resolve them silently.

## Current phase
Phase 2 (design system) complete, awaiting owner approval. Phase 3 (hero motion) not started. CMS, membership, homepage, deployment: **not authorised**.

## Skills — use the matching one
| Task | Skill |
|---|---|
| Tokens, foundations, specs, audit | `nl-tag-design-system` |
| Routes, data, Next.js, i18n | `nl-tag-frontend-development` |
| New/changed component | `nl-tag-component-authoring` |
| Any animation, the hero | `nl-tag-motion-system` |
| WCAG checks | `nl-tag-accessibility` |
| Metadata, sitemap, hreflang | `nl-tag-seo` |
| Content models, CMS roles | `nl-tag-cms-content` |
| Membership | `nl-tag-membership` |
| Testing | `nl-tag-quality-assurance` |
| GitHub, Hostinger | `nl-tag-hostinger-deployment` |

## Before UI work
Read: `docs/design-system/foundations/foundations.md` → `docs/design-system/tokens/token-reference.md` → the component spec in `docs/design-system/components/` → `docs/design-system/patterns/page-composition.md`. Inspect `src/design-system` before creating anything.

## Hard rules
- Look up, don't make up: tokens only (layers 2–3); never edit `tokens.css`; new tokens go in `component-tokens.css` as `[ADDITION]` and need approval.
- Reuse components; no parallel visual language for any feature.
- Only the homepage hero animates a gradient. Everything else is static.
- All text on gradients is `--color-text-on-gradient`. 44px minimum targets. Tamil never gets negative tracking or uppercase.
- Never invent church content: names, history, beliefs, times, addresses, contacts, events, testimonies, Bible wording, social accounts. Missing → `CONTENT REQUIRED`, unpublished.
- Schedule facts only from `src/content/schedule.ts` (Gate 0). Sunday School is on **Friday**. Write **NECK** exactly. No address.
- Bible text: placeholder only until permission is documented.
- Tamil wording: the 48 reviewed items were approved by the owner on 1 Nov 2026 (`docs/content/tamil-content-review.md`). Owner-supplied Tamil (`src/content/tamil-approvals.ts`) is reproduced exactly; never rephrase or "correct" it. New Tamil strings start as `draft-review` and need owner approval.
- Ask before changing tokens, membership policy, security, SEO strategy, dependencies with cost, or deployment. Never deploy, push to `main`, change repo visibility or touch DNS without explicit approval.

## Definition of done
`npm run verify` (token audit, lint, typecheck, unit tests, build) and `scripts/serve-gallery.sh && npm run test:e2e` pass; docs/specs updated when behaviour or rules change; report changes, tests and remaining risks.
