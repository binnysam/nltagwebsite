# Staging acceptance QA: report (9–10 November 2026)

## 1. Deployment

- **Live staging:** https://staging.nltagkuwait.com
- **Verified code:** branch `claude/elegant-pasteur-es9mnm` @ **`ba8d969`**, Hostinger build `01a1c2b3` completed 23:46 UTC; `/api/health` → `{"status":"ok","deployment":"staging","database":true,"stagingVerified":true}`. The commit that adds this report changes documentation only; its auto-deploy is checked in §10.
- **Baseline before changes:** branch and live build were both `b770c3b`; production on `c2301e2` (`main`).
- **Separation (re-confirmed):**
  - **Databases:** `u339364475_staging` and `u339364475_nltag`, each with its own user.
  - **Variables:** separate per website (15 on staging, 12 on production; names only were read, values never).
  - **Media:** the runtime log shows `/home/u339364475/nltag-data-staging/media`.
  - **Mail:** capture mode, no `SMTP_*` on staging.
  - **Forms:** off on live (`NLTAG_PUBLIC_FORMS=0` as configured; prayer, gallery and testimony-share all answer 404).

## 2. Pages tested (live, Tamil and English)

A scripted browser crawl of every page reachable from the home pages (22 pages), each at **390, 768 and 1280 px**:
- homepage (incl. events, announcements, schedule, ministries, sermons, testimonies, verse, visit sections);
- About, Worship times, Ministries;
- Sermons list and sermon detail;
- Testimonies list and testimony detail;
- Contact;
- the CMS extra page;
- the custom 404 in both languages.

Each page was checked for:
- **Response and language:** HTTP status, `lang`, a single `h1`;
- **Titles and metadata:** `[STAGING]` title, robots `noindex, nofollow`, canonical on the staging origin, `hreflang` ta/en/x-default, Open Graph and Twitter tags;
- **Accessibility:** axe WCAG 2.2 AA;
- **Layout and loading:** horizontal overflow, broken images, console and network errors;
- **Links:** every internal link followed.

**Final result: 22/22 pages clean** (0 axe violations, 0 overflow, 0 broken images, 0 broken internal links; the only external link is the fixture's `video.example.test`).

Also checked by hand and in the browser:
- **Language switch:** keeps the page in both directions.
- **Keyboard:** the first Tab goes to a visible skip link, and every focusable element in the header and main area shows a focus ring.
- **Mobile menu:** opens and closes, and Escape closes it.
- **Motion:** only the homepage hero animates.
- **Prayer, gallery and testimony-share:** 404 (forms off), and the contact page shows no form.
- **Error page** (`error.tsx`): covered by unit tests. A live crash cannot be triggered safely.
- **Not on live** (forms off): prayer, gallery and testimony-share were tested locally (§4–5).

Screenshots inspected (phone and desktop): home, sermons list, sermon detail, testimony, contact, 404, worship times, mobile menu, skip link. Typography (Anek Tamil, Inter), the hero, cards, buttons, the footer and the STAGING banner render as designed.

## 3. CMS and authentication

Live staging has no staff account yet. The set-password link is captured to a file outside the website root, which the Hostinger API cannot read (§10). CMS and auth were therefore tested in full against a **local staging build** with the same configuration shape (own MariaDB 11.8.9 database and user, own media and mail folders, `NLTAG_DEPLOYMENT=staging`):

| Area | Result |
|---|---|
| Mailbox-first account request → captured set-password link → password → two-factor enrolment (3 staff) | pass |
| Staging admin bootstrap (test address), Content Editor and Prayer Team roles granted in the UI | pass |
| Login with two-factor; **logout ends the session**, `/admin` returns to sign-in, session endpoint no longer knows the user (new test) | pass |
| Admin suite (`E2E_AUTH=1 admin`): bilingual editor create → validate (HTML refused) → save → preview (not public) → publish → unpublish with confirm dialog; Content Editor drafts and submits, cannot publish, no staff or audit; lists, filters, empty states; anonymous → sign-in, members → 404; mobile admin menu by keyboard | 11 passed, 1 skipped (documented) |
| Two-factor suite: enrol, sign in with app and recovery code, turn off (ta, en); Church Admin without two-factor forced to set it up; seeded admin reaches the admin only after the code | 8 passed |
| Role isolation: Content Editor → 404 on prayer, contact, staff; Prayer Team → 404 on contact, submissions, CMS, media, gallery, staff, audit, and no delete | pass |
| Search and pagination (public sermons), error handling (validation summaries, 404s) | pass (public and admin suites) |

On live: `/admin` → 307 to sign-in, and the account request for a listed test address returns the neutral reply with no error in the runtime log.

## 4. Forms and permissions

**Decision:** public forms stay **off on the live site**.
- **Infrastructure gate:** Hostinger's API offers no password protection or IP restriction for the site, and the staging web root holds only Passenger's `.htaccess`.
- **App-level gate:** a staff-only gate would be new security code, which `CLAUDE.md` says needs your review.

As instructed for that case, forms were tested in the local staging build and the MariaDB integration suite:

| Check | Result |
|---|---|
| Prayer: Tamil server-side errors, then an anonymous request; stored **encrypted** (AES-256-GCM); notification without content, captured `[STAGING]`, never delivered | pass |
| Contact: all fields stored; full message to the church inbox (captured); Church Admin only | pass |
| Testimony: consent required; never published automatically; "Accept as draft" creates an unpublished draft | pass |
| Spam controls: honeypot, signed token (too fast / expired), 24 h duplicate refusal, site-wide ceiling ("busy") | pass (integration) |
| Prayer Team: reads and marks status; only Church Admin deletes (real delete) | pass |
| Content Editor: reads testimony text, never contact details; no prayer, no contact | pass |
| Every captured message is `[STAGING]` and addressed to `@nltag.test` | pass |

## 5. Gallery, media and YouTube

| Check | Result |
|---|---|
| Upload a fictional JPEG with EXIF copyright and GPS → public copy is WebP 960 px with **no EXIF/GPS** | pass |
| Publish refused until the photo permission is recorded; unpublished photos → 404 | pass |
| **Deleting the library image** removes the published gallery copy (404) and the photo leaves the public gallery; admin shows "library image deleted" (new test) | pass |
| Originals never public: public URLs are only `/gallery-image/<id>/<width>` copies | pass |
| Media survives redeploys on **live** staging: the marker written at the first start (21:56:59 UTC, build `01a1c24d`) is found by build `01a1c2b3` | pass |
| Production media never accessed: staging resolves real paths and refuses `<home>/nltag-data`; the live runtime log names only `nltag-data-staging/media` | pass |
| **YouTube click-to-load** (new test): no request to YouTube or Google before Play (ta and en); then the `youtube-nocookie.com` player at 16:9; fits a 390 px phone with no overflow | pass |

## 6. Mobile, tablet and desktop

The live crawl at 390, 768 and 1280 px found no overflow and no broken images. Desktop header widths were measured at 1024–1440 px in both languages; that check found the one layout defect (§9.1), now fixed and verified live.

## 7. Accessibility

- 0 axe WCAG 2.2 AA violations on all 22 live pages and on every page in the local suites.
- 44 px targets, except the language-switch segments: 38 px visible with a 44 px hit area through `::after`, as the approved spec says.
- Skip link first in tab order and visible on focus; focus rings everywhere; menu keyboard behaviour correct; Tamil `lang` attributes correct.

## 8. Test suites (MariaDB 11.8.9, final code)

| Suite | Passed | Failed | Skipped |
|---|---|---|---|
| `npm run verify` (token audit, Tamil record 226, lint, typecheck, unit, build) | 382 unit (27 files) | 0 | 0 |
| `npm run test:integration` (incl. staging claim block) + production-config pass | 286 + 6 | 0 | 0 |
| Staging safety unit tests (in verify) + canonical regression tests | 35 + 4 | 0 | 0 |
| Browser, unseeded: design-system + hero + public-site + accounts-gate | 186 | **2** | 22 |
| Browser, seeded (`PUBLIC_E2E_SEEDED=1`): public-site + accounts-gate | 111 | 0 | 11 |
| Admin (`E2E_AUTH=1`) | 11 | 0 | 1 |
| Two-factor (`E2E_AUTH=1`, 1 worker) | 8 | 0 | 0 |
| Staging suite, local staging build (forms on) | 41 | 0 | 7 |
| Live staging: environment, canonical, public pages, map placeholder; header, language switch, hero-only motion | 14 + 10 | 0 | 2 |

**The 2 failures:** the phone pixel baselines `verse-compact` and `verse-square` (1942 px, 2%). They fail the same way on code that hasn't been touched: this sandbox's Chromium is build 1243 and the project pins 1248. These tests are not in CI. Baselines were not regenerated, because a 1243 baseline would be wrong for 1248.

**Skips** are the suites' own: seeded/unseeded halves, one-project tests, and staff flows at 1280 only.

## 9. Bugs found and fixed (commit `ba8d969`, deployed and verified)

1. **Tamil desktop header ran out of its container.** With the approved Tamil labels the header row was 34 px wider than the 1200 px container at every desktop width, so at 1280 px the join-us button sat 6 px from the window edge instead of the 40 px gutter. Tamil is the default language.
   - **Fix:** Tamil only, from 1280 px, one token step less link padding and bar gap (`--space-2`, `--space-3`). English is unchanged.
   - **Regression test:** checks both languages at 1280 and 1440 px. It failed on the old live site (1273.6 > 1240.5) and passes on the new one.
   - **Spec note:** updated.
2. **Staging canonical test rejected the staging origin.** It is now an exact-origin check: production (`nltagkuwait.com`, `www`) and any other origin are rejected, and the staging origin is accepted. 4 unit regression tests; passes live.
3. **Design-system test harness:** every gallery check got a 404, because the gallery flag was set only for the build. Since the staging banner, pages render per request. The flag is now also set for `next start` in `playwright.config.ts` and `scripts/serve-gallery.sh`. Before the fix, 25 design-system checks failed because of it.
4. **New tests for gaps:** sign-out and sessions, media deletion, YouTube click-to-load on a phone. Also `playwright.staging-live.config.ts`, so the suites can run against live staging without building a local server.

## 10. Remaining items

1. **Live staff accounts:**
   - **What's blocking:** set-password links are captured to `/home/u339364475/nltag-data-staging/mail-capture/`, outside the web root. The Hostinger API cannot read it.
   - **You:** hPanel → File Manager → that folder → newest file → open the link. A request for `admin@nltag.test` was already made on 9 Nov; request again on `/en/sign-up`, since links last 1 hour.
   - **Then:** set `NLTAG_STAGING_BOOTSTRAP_ADMIN_EMAIL=admin@nltag.test` for one deploy.
   - **Alternative:** if you'd like me to do this unattended next time, approve a staging-only option that also writes captured set-password links to the staging runtime log. That is a security-relevant change, so it isn't made.
2. **Forms on live staging** need an access gate first: either your decision on a staff-only gate (security change for review), or hPanel directory protection if you want it. Until then they stay off.
3. **Not fixed (your decision):**
   - **Schedule list dividers:** in the approved ScheduleList, the row dividers extend 12 px past the list's top border. On phones they start 4 px from the screen edge. A change would alter the approved `schedule` pixel baseline, which cannot be regenerated faithfully here.
   - **Meta descriptions:** the homepage and list pages have no description (`og:description`), and there is no `og:image` (logo not chosen yet). Both need approved church wording or a logo. Testimony pages leave the description empty on purpose.
4. **2 pixel baselines** (Chromium version): regenerate on the pinned Chromium in CI or on a developer machine.

## 11. Production: unchanged

Checked against the baseline before and after every deploy:
- **Build and auto-deploy:** same build `01a1bede` (`main` @ `c2301e2`, 9 Nov 05:53 UTC); auto-deploy still on `main`.
- **Settings:** the same 12 variable names (values never read or written); SSL lifetime active with redirect on; CDN on; no subdomains or aliases.
- **Database:** `u339364475_nltag` `updated_at` still 2026-11-02 05:35:18.
- **GitHub:** `main` still `c2301e2`; `claude/upbeat-faraday-qh8gmr` still `2f59f35`.

Never done: production migrations, production emails, production admin changes, merges or PRs. `noindex, nofollow` stays on staging.
