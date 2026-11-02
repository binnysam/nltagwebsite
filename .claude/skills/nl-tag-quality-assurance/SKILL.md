---
name: nl-tag-quality-assurance
description: Use to test NLTAG changes: token audit, lint, typecheck, unit and axe tests, browser tests at 390/1280, visual baselines and build.
---

# NLTAG quality assurance

## Commands
| Command | What it checks |
|---|---|
| `npm run audit:tokens` | No raw visual values, primitive tokens or unknown tokens in components |
| `npm run lint` / `npm run typecheck` | ESLint (Next core-web-vitals + TS), strict TypeScript |
| `npm test` | Vitest: content rules (Gate 0 schedule, Sunday School on Friday, NECK, placeholders), token file hash, audit self-test, components + axe |
| `npm run build` | Production build |
| `npm run verify` | All of the above in order |
| `npm run test:integration` | MariaDB 11.8 (CI) / local MariaDB: auth flows, enumeration, CSRF, rate limits, sessions, roles, permissions, audit privacy, collation, Tamil round-trip |
| `scripts/serve-gallery.sh` then `npm run test:e2e` | Real Chrome at 390px and 1280px: axe with contrast, 44px targets, no horizontal scroll, computed styles vs spec, Tamil type rules, menu keyboard flow, redirects, noindex, visual baselines |

Set `CHROME_PATH` if Playwright's bundled browser is not installed.

## Rules
- Never weaken a test or the audit to make it pass; fix the code or escalate.
- New visual baselines are reviewed (look at the image) before committing. Baselines are per platform; regenerate on the CI platform when CI is added.
- Tests never contain real member data or invented church content.

## Report
Commands run, pass/fail counts, failures fixed, anything skipped and why, remaining risks.
