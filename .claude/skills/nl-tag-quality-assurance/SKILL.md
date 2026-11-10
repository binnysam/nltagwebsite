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
- New visual baselines are reviewed (look at the image) before committing. Reuse approved baselines; never regenerate them automatically (`--update-snapshots` only with owner approval, e.g. moving baselines to the CI platform).
- Minimise screenshots (CLAUDE.md → "Screenshots and token use"): prefer assertions, DOM/computed-style checks and axe; screenshot only a genuine visual defect or on owner request, max one before + one after.
- Tests never contain real member data or invented church content.

## Report
Concise: commands run, pass/fail counts, failures fixed, anything skipped and why, remaining risks. No step-by-step narration; no screenshots unless essential evidence.
