# Staging environment and website completion: report (9 November 2026)

**Branch:** `claude/upbeat-faraday-qh8gmr` = PR #25 (`0e7ba3c`, preserved, fast-forward) + this work. A local branch `staging` points at the same commit. **Nothing has been pushed, merged or deployed. No production setting, database, media folder, DNS or deployment configuration was touched.**

## 1. Baseline (what the repository did before this work)

| Question | Finding |
|---|---|
| Production deployment | Hostinger Node.js app, GitHub integration on `main`; every push to `main` builds `build:hostinger` (`scripts/hostinger-build.mjs` → `next build`) and restarts. |
| PR previews | Hostinger's bot builds PR branches (PR #25 → `powderblue-fly-151112.hostingersite.com`). Which environment variables and database previews use is **unknown** (not visible from here). |
| Migrations at build | Only with `NLTAG_APPROVED_PRODUCTION_MIGRATION=1`; never automatic. |
| Database selection | `DATABASE_URL` only. |
| Better Auth | `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`; accounts gate (`NLTAG_ACCOUNTS_ENABLED`, SMTP, `AUTH_RATE_LIMIT=on`). |
| Media folder | `NLTAG_MEDIA_DIR`, else `<account home>/nltag-data/media` in production. |
| Email | Gmail SMTP (`SMTP_*`); production refuses to send without it. |
| Could a staging app use production resources? | **Yes.** Nothing distinguished environments: a second app on the same Hostinger account with copied variables would have used the production database, **the same media folder by default** (same Unix user → same home), the production auth secret, and delivered real email. |
| PR #25 | Done: footer CMS pages, sermon/testimony detail, sermon search/filter/pagination, bilingual 404, Open Graph. Missing: forms, gallery, video, map, error page, logo; 13 Tamil strings pending. |

Baseline tests on PR #25 head (MariaDB 11.8.9 here): `npm run verify` pass (305 unit) · `npm run test:integration` 270 + 6 pass.

## 2. Staging architecture (built)

Full guide and hPanel procedure: `docs/operations/staging.md`. Summary: second Node.js app on `staging.nltagkuwait.com`, branch `staging`, own database and user (`…_staging`), own secret (`nltag-staging-…`), own media folder (`/home/u339364475/nltag-data-staging/media`), mail captured to files, `noindex` + `X-Robots-Tag` + `robots.txt Disallow`, `[STAGING]` banner/titles/subjects.

Fail-closed safeguards (code in `src/server/deployment/`):
- Configuration rules refuse the production database name/user, a secret without the staging prefix, a media folder that is or overlaps production's, real SMTP, Google client, production migration and bootstrap flags, and non-test addresses. Production gets the mirror checks (no staging secret, database or folder).
- **Live identity checks**, not names: the database server's own `SELECT DATABASE()` must name staging and hold the `nltag_environment = staging` marker; the media folder's real path (symlinks resolved) must not overlap production and must hold its `.nltag-environment` marker. Until verified, staging refuses all database, media and mail use; `/api/health` reports it.
- Migrations: `staging:migrate` only for a verified staging database; `db:migrate` refuses staging and still needs the owner flag for production.
- No production admin bootstrap; staging admin only for a reserved test address. Fixtures cannot sign in.

## 3. Completed features (on top of PR #25)

| Area | Delivered |
|---|---|
| Tamil | The 13 PR #25 strings recorded as approved (9 Nov 2026), wording unchanged, checked character by character. |
| Prayer requests | `/prayer` form (name/contact optional, consent), stored **encrypted at rest** (AES-256-GCM, `NLTAG_DATA_KEY`), notification email without content, inbox for Church Admin and the new **Prayer Team** role only (two-factor required); Content Editors never see them; viewing audited; kept until a Church Admin deletes (real delete). |
| Contact form | Name, Email, optional Phone, Subject, Message on `/contact`; stored; full message emailed to the church inbox; Church Admin inbox. |
| Testimonies | `/testimonies/share` with display choice (full / first name / anonymous) and two consents; review inbox; **"Accept as draft"** creates an unpublished CMS testimony; never auto-published. |
| Spam / abuse | Honeypot, signed form token (3 s – 2 h), 24 h duplicate refusal, ≤ 2 links, site-wide ceilings; no IP use; audit with ids only. |
| Gallery | Library images → gallery drafts with ta/en captions; Church Admin records photo permission and publishes; public WebP copies (480/960/1600) with **all metadata removed**; originals never public; `/gallery` with pagination. |
| Video | Click-to-load `youtube-nocookie` player on sermon pages; zero requests to Google before Play. |
| Map | Placeholder on Contact; `churchLocation = null` until the owner supplies a verified location. |
| Error page | Bilingual `[locale]/error.tsx`. |
| Admin | Inboxes with status filters and pagination, dashboard counts, Prayer Team role in Staff page. |
| Logo | Three directions for review: `docs/brand/logo-concepts/review.html` (live wordmark unchanged). |
| Family Directory | Architecture only: `docs/architecture/church-family-directory.md`. Nothing implemented. |

All database-backed features are behind `NLTAG_PUBLIC_FORMS=1` (needs migration `0004_forms_gallery`), so merging without the migration leaves production behaving as now.

## 4. Remaining blockers and decisions (owner)

1. **Push approval** for `staging` and the work branch (nothing pushed).
2. **PR-preview check (D1):** confirm in hPanel which variables Hostinger PR previews use; disable previews if they share production's database, before pushing anything with migration 0004.
3. **hPanel staging setup** (steps in `docs/operations/staging.md` §4); Claude has no hPanel access (the Hostinger connector failed to connect in this session).
4. **Tamil approval** of 55 new strings (forms, gallery, video, map, error page), especially the three consent texts; still `draft-review`.
5. **Church inbox address** for production notifications (`NLTAG_CHURCH_INBOX`), and production `NLTAG_DATA_KEY` with two named key holders.
6. **Production migration window** for `0003` (still unapplied) + `0004`, with backup.
7. Church facts: verified location (map), logo choice, content (welcome, history, leadership, contact).
8. Roadmap decisions assumed with the recommended option, reversible: prayer notification = notice only (D5); spam = no third-party captcha (D6); Prayer Team two-factor required and cannot delete (D7); contact inbox = Church Admin only (D8); Content Editors may read testimony submissions without contact details (D12); upload limit stays 2 MB, JPEG/PNG/WebP (D13/D14 not raised); public image route added for gallery only (D14).
9. Privacy page and retention rules (D9) for contact/testimony submissions: not built; prayer = manual deletion as approved.
10. Legal: Kuwait data-protection obligations should be confirmed by a qualified adviser before the forms go live.

## 5. Test results

Final run on the final code (local MariaDB 11.8.9 in Docker, the production engine and version):

| Suite | Result |
|---|---|
| `npm run verify` (token audit, Tamil record, lint, typecheck, unit, production build) | pass: 377 unit tests |
| `npm run test:integration` | pass: 286 + 6 (production-config pass) |
| Staging browser QA `tests/e2e/staging.spec.ts` | 38 passed, 4 skipped (staff flow runs at 1280 only by design) |
| Public site seeded (`public-site`, `accounts-gate`) | 109 passed, 9 skipped (same skips as CI) |
| Admin (`E2E_AUTH=1 admin`) | 11 passed, 1 skipped (as documented) |
| Two-factor | 8 passed |
| Design system + hero | 85 passed, 2 failed, 1 skipped. The 2 failures (phone `verse-compact`, `verse-square` pixel baselines) fail identically on the untouched PR #25 head here: the sandbox Chromium is build 1243, the project pins 1248. CI should be green on them. |

Not run: `auth.spec.ts` (documented as local `next dev` only; covered by the staging mailbox-first flow instead).

## 6. Staging QA report (local staging simulation)

Run against a production build started with the staging configuration, its own MariaDB 11.8.9 database and user (grants on the staging database only), own media and mail folders (`tests/e2e/staging.spec.ts`, 390 px and 1280 px, Tamil and English, axe WCAG 2.2 AA, 44 px targets, no sideways scroll):
- Environment: banner, `[STAGING]` titles, own canonical origin, `X-Robots-Tag`, `robots.txt`, health = verified.
- Fail-closed checks against real MariaDB: empty unclaimed database refused; production-shaped `DATABASE_URL` refused; production-style secret refused; real SMTP refused; `db:migrate` refuses staging; claim + migrate + verify pass.
- Forms: server validation messages in Tamil; prayer, contact and testimony submissions stored; notification captured with `[STAGING]` subject, never delivered; every captured message addressed to `@nltag.test`.
- Staff: real mailbox-first account requests, captured set-password links, two-factor enrolment for three accounts; staging admin bootstrap via the build script; roles granted in the UI.
- Permissions: Prayer Team sees only prayer requests (404 on contact, submissions, CMS, media, gallery, staff, audit; no delete); Content Editor 404 on prayer, contact, staff; Church Admin all.
- Testimony accepted → draft, not published. Gallery: publish refused without permission; published copy is WebP 960 px with no EXIF/GPS; unpublish → 404.
- Media persistence: the storage marker written at the first start was found after every later rebuild/restart.

Defects found by the QA pass and fixed: quick correction after a validation error was treated as a bot (token time now kept); dashboard title missed the `[STAGING]` prefix; inbox row links below 44 px; banner was a live region; banner stylesheet changed approved visual baselines; banner exposed the header's hidden skip link; gallery hash column used MariaDB JSON (`utf8mb4_bin`), breaking the collation rule.

## 7. Production release checklist (each step needs the owner's explicit approval)

1. Staging configured and its QA repeated on `staging.nltagkuwait.com` (health, banner, forms, inboxes, gallery, mail capture).
2. Tamil: 55 new strings approved (or the features hidden); update `tamil-approvals.ts`, review sheet and tests.
3. Owner chooses the logo direction (separate change; live wordmark untouched until then).
4. Production backup verified (database + `/home/u339364475/nltag-data/media`).
5. Production migration window: `0003_two_factor` + `0004_forms_gallery` with `NLTAG_APPROVED_PRODUCTION_MIGRATION=1` for one build, then removed (`docs/operations/production-migration-cms.md`).
6. Production variables (hPanel, owner): `NLTAG_DATA_KEY` (new), `NLTAG_CHURCH_INBOX`, then `NLTAG_PUBLIC_FORMS=1`. Do **not** set `NLTAG_DEPLOYMENT`. Confirm none of the staging values are present.
7. Accounts activation milestone (separate runbook `docs/operations/admin-activation.md`): first Church Admin with two-factor; Prayer Team members granted.
8. Merge the PR into `main` (= deploy) only on the owner's word; watch the build log and `/api/health`.
9. Post-deploy checks: `/ta`, `/en`, forms (one test submission each, then delete), inbox access by role, gallery empty state, `noindex` still present.
10. Rollback: revert the merge commit; forms switch off by removing `NLTAG_PUBLIC_FORMS` (no rebuild needed for runtime pages); the 0004 tables can stay (additive).
