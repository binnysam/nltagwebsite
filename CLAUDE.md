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
Phase 2 (design system) integrated. Phase 3 (motion system, homepage hero) approved by the owner on 1 Nov 2026 (120s preset cycle, 0.35 hero field opacity, Tamil font preload on both locales). Phase 4a (Hostinger check) done: MariaDB 11.8.9. Phase 4b (database, auth, roles, audit, rate limits, account emails) approved and merged on 2 Nov 2026, with the **accounts gate**: account pages and `/api/auth` return 404 until SMTP is configured, tested and `NLTAG_ACCOUNTS_ENABLED=1` is set (`docs/backend/data-and-auth.md`). The owner approved replacing the old trial site on nltagkuwait.com with this site. Phase 4c (CMS and admin dashboard) approved and merged on 2 Nov 2026 with the owner's decisions: `--color-scrim` token, and images stored as files in `/home/u339364475/nltag-data/media` outside the deployment (`docs/operations/media-storage.md`). Migrations `0001_cms_content` and `0002_media_file_storage` were applied to production on 2 Nov 2026 with the owner's approval (verified backup first); any further migration needs new explicit approval. See `docs/backend/cms.md` and `docs/content/admin-guide.md`. SMTP delivery tested on 2 Nov 2026 (Stage A, removed in Phase 6a). Phase 5 (public website connected to the CMS) built on branch `phase5/public-cms-site` (2 Nov 2026), PR #8: public pages read published content only through `src/server/cms/public.ts` + `public-site.ts` (`docs/backend/cms.md` → "Public website"); its 15 Tamil strings were approved by the owner on 2 Nov 2026. Phase 6a (2 Nov 2026, PR awaiting owner approval): accounts gate also requires `AUTH_RATE_LIMIT=on` in production; staff-only sign-up allowlist `NLTAG_SIGNUP_ALLOWLIST` (fails closed); one-time first-admin bootstrap from `NLTAG_BOOTSTRAP_ADMIN_EMAIL` in the Hostinger build. PRs #8 and #9 merged and deployed on 2 Nov 2026. Phase 6b (2 Nov 2026, PR #10, owner decisions approved 2 Nov 2026, merge awaiting owner): mandatory authenticator-app two-factor for Church Admins, optional for Content Editors (Better Auth two-factor plugin, migration `0003_two_factor` — not applied to production; rules in `src/server/auth/two-factor-policy.ts`, `docs/backend/data-and-auth.md` → "Two-factor"); the bootstrap requires two-factor. Accounts stay off until the owner's activation window (`docs/operations/admin-activation.md`). Client-IP security fix (Nov 2026, PR on branch `security/client-ip-rate-limit`, awaiting owner review): one resolver for rate limits and audit behind Hostinger's CDN (`src/server/security/client-ip.ts`, `src/proxy.ts`, `docs/backend/client-ip.md`), header-shape capture without addresses (keyed on the CDN-written tail); skipped hops must be internal and `CLIENT_IP_CROSSCHECK=none` is refused in production. Follow-up after the security review (3 Nov 2026, same PR, awaiting owner review): per-account sign-in protection reserves each password check atomically before it runs, progressive delay instead of a hard lock, recognised-browser budget, `auth.sign_in.throttled` audit + alert email (Tamil `draft-review`) (`docs/backend/data-and-auth.md` → "Sign-in protection"); `npm run test:integration` also runs a NODE_ENV=production pass. `CLIENT_IP_SOURCE` stays unset until the capture is reviewed. 4d membership interface: **not authorised**.

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
| Database, auth, roles, audit, emails | `nl-tag-data-and-auth` |
| Testing | `nl-tag-quality-assurance` |
| GitHub, Hostinger | `nl-tag-hostinger-deployment` |

## Before UI work
Read: `docs/design-system/foundations/foundations.md` → `docs/design-system/tokens/token-reference.md` → the component spec in `docs/design-system/components/` → `docs/design-system/patterns/page-composition.md`. Inspect `src/design-system` before creating anything.

## Hard rules
- Look up, don't make up: tokens only (layers 2–3); never edit `tokens.css`; new tokens go in `component-tokens.css` as `[ADDITION]` and need approval.
- Reuse components; no parallel visual language for any feature.
- Only the homepage hero (`Hero` component) animates a gradient. Everything else is static.
- All text on gradients is `--color-text-on-gradient`. 44px minimum targets. Tamil never gets negative tracking or uppercase.
- Never invent church content: names, history, beliefs, times, addresses, contacts, events, testimonies, Bible wording, social accounts. Missing → `CONTENT REQUIRED`, unpublished.
- CMS: all content writes through `src/server/cms/service.ts`; workflow rules in `src/server/cms/rules.ts`; Markdown only (no HTML), rendered with `src/lib/markdown.tsx`. Admin UI reuses design-system components (`Notice`, `DataTable`, `SelectField`, `CheckboxField`, `ConfirmButton`).
- Schedule facts only from `src/content/schedule.ts` (Gate 0). Sunday School is on **Friday**. Write **NECK** exactly. No address.
- Bible text: placeholder only until permission is documented.
- Tamil wording: the 48 reviewed items were approved by the owner on 1 Nov 2026; the 15 Phase 5 public-site strings, 38 Phase 4b account/email strings and 45 Phase 6b two-factor strings on 2 Nov 2026 (`docs/content/tamil-content-review.md`, `phase5ApprovedTamil`, `phase4bApprovedTamil`, `phase6bApprovedTamil`). Only `auth.google`/`auth.or` and the two `email.signInThrottled.*` alert strings (sent English-only until approved) remain `draft-review`. Owner-supplied Tamil (`src/content/tamil-approvals.ts`) is reproduced exactly; never rephrase or "correct" it. New Tamil strings start as `draft-review` and need owner approval.
- Ask before changing tokens, membership policy, security, SEO strategy, dependencies with cost, or deployment. Never deploy, push to `main`, change repo visibility or touch DNS without explicit approval.

## Definition of done
`npm run verify` (token audit, lint, typecheck, unit tests, build), `npm run test:integration` (MariaDB) and `scripts/serve-gallery.sh && npm run test:e2e` pass (account pages and admin: `E2E_AUTH=1`, see `tests/e2e/auth.spec.ts` and `tests/e2e/admin.spec.ts`); docs/specs updated when behaviour or rules change; report changes, tests and remaining risks.
