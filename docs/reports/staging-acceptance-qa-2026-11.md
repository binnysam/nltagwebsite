# Staging acceptance QA: report (9–10 November 2026, follow-up §12)

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

**The 2 failures:** the phone pixel baselines `verse-compact` and `verse-square` (1942 px, 2%). *Corrected 10 Nov 2026 (§12.3):* the browser version is **not** the cause. They fail identically on the exact pinned Chromium 1248, and a bisect shows they have been stale since commit `70af50e` (2 Nov). Baselines were not regenerated.

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
4. **2 pixel baselines:** see §12.3. The cause is stale baselines, not the Chromium version. Candidate baselines made on the pinned Chromium await your approval.

## 11. Production: unchanged

Checked against the baseline before and after every deploy:
- **Build and auto-deploy:** same build `01a1bede` (`main` @ `c2301e2`, 9 Nov 05:53 UTC); auto-deploy still on `main`.
- **Settings:** the same 12 variable names (values never read or written); SSL lifetime active with redirect on; CDN on; no subdomains or aliases.
- **Database:** `u339364475_nltag` `updated_at` still 2026-11-02 05:35:18.
- **GitHub:** `main` still `c2301e2`; `claude/upbeat-faraday-qh8gmr` still `2f59f35`.

Never done: production migrations, production emails, production admin changes, merges or PRs. `noindex, nofollow` stays on staging.

## 12. Follow-up: live CMS acceptance and final polish (10 November 2026)

**Baseline at start:**
- **Staging:** branch `claude/elegant-pasteur-es9mnm` @ `0d57240`, Hostinger build `01a1c2bf` completed 23:59 UTC 9 Nov, auto-deploy on this branch.
- **Health:** `{"status":"ok","deployment":"staging","database":true,"stagingVerified":true}`.
- **Production:** `main` @ `c2301e2`, build `01a1bede`, 12 variable names.

Note: `docs/operations/staging.md` §1 names the branch `staging`, but the live staging app deploys `claude/elegant-pasteur-es9mnm`, as hPanel shows.

### 12.1 Staging administrator (`admin@nltag.test`): ready for your two hPanel steps

**Status:**
- Not created yet. No staff account exists on live staging.
- I can't finish this alone. The set-password link is written only to a file outside the web root, which the Hostinger API can't read. Changing the bootstrap variable means replacing the whole variable set in hPanel, and the API returns values masked.
- Nothing was logged, and no link or password was put anywhere else.

**Controls checked in code** (`environment.ts`, `transport.ts`, `scripts/staging/staging.ts`):
- `NLTAG_STAGING_BOOTSTRAP_ADMIN_EMAIL` is accepted only for reserved test addresses (`…@nltag.test`).
- The production variable `NLTAG_BOOTSTRAP_ADMIN_EMAIL` is refused on staging.
- The bootstrap applies production's rules: verified account, allowlisted, two-factor on, first admin only.
- It runs only in a staging build, against the verified staging database (name and marker row).
- Staging has no `SMTP_*` variables, so mail can only be captured to files (`getTransport` → `stagingCapture`).

**Exact procedure (staging website only; never open the production website's settings):**

1. **Request the account** (link valid 1 hour, single use): open `https://staging.nltagkuwait.com/en/sign-up`, enter `admin@nltag.test` and send. You always get the same neutral reply, by design. If no file appears in step 2, `admin@nltag.test` is probably missing from staging's `NLTAG_SIGNUP_ALLOWLIST`.
2. **Get the captured email:**
   - hPanel → **Websites** → `staging.nltagkuwait.com` → **Files → File Manager**.
   - Go up from `public_html` to the account home, then to `nltag-data-staging/mail-capture/`. This is the folder named in `NLTAG_STAGING_MAIL_DIR`, which the earlier report recorded.
   - Files are named `<date-time>-<8 hex>.json`. Sort by date, newest first. Open the newest file whose `"to"` is `admin@nltag.test` and whose `"subject"` starts with `[STAGING]`.
   - Copy the `https://staging.nltagkuwait.com/api/auth/reset-password/…` link from the `"text"` field into a private browser window.
   - Don't download, forward or paste the file anywhere. It is mode 0600 and lives only on staging.
3. **Choose a password** (at least 10 characters, never one used for a real account). The page then sends you to sign in.
4. **Sign in and turn on two-factor:** Account → Two-factor → scan the QR code into your authenticator app, or type the setup key. Enter the 6-digit code and keep the recovery codes privately. Two-factor must be on **before** step 5, or the bootstrap is refused.
5. **Enable the bootstrap, once:**
   - hPanel → staging website → **Advanced → Node.js → Environment variables**.
   - Add `NLTAG_STAGING_BOOTSTRAP_ADMIN_EMAIL` = `admin@nltag.test` and save.
   - Then **Deploy / Rebuild**. The bootstrap runs only during a build, not on a restart.
6. **Check the build log** for `Admin bootstrap: Church Admin role granted …`. If you see `refused by the role rules`, two-factor or the set password is missing. Redo step 4 and rebuild.
7. **Remove the variable straight away:**
   - Delete `NLTAG_STAGING_BOOTSTRAP_ADMIN_EMAIL` and save.
   - No rebuild is needed: the variable is read only at build time, and a second bootstrap is refused once an admin exists.
   - It must not stay set. I'll confirm it's gone (by name) when I next check the deployment.
8. **Optional, for the role and review checks:**
   - Repeat steps 1–4 for `editor@nltag.test` and `prayer@nltag.test` (if they are in the allowlist).
   - As the admin, grant Content Editor and Prayer Team under Admin → Staff and roles. No bootstrap variable is needed for these.

### 12.2 Live CMS acceptance: test written, waiting for the account

**Status:** not run on live yet. It is blocked on §12.1.

**What was checked on live now (anonymous):**
- `/admin`, `/admin/staff` and `/admin/media` → 307 to `/en/sign-in`.
- `/admin/prayer` → 404 (forms off).
- `/api/auth/get-session` → no user.

**New suite `tests/e2e/staging-live-cms.spec.ts`** (desktop project, serial, fictional content marked `[E2E LIVE <run>]`). It covers:

| Area | What it checks |
|---|---|
| Unauthorised access | admin pages → sign-in; preview closed to visitors; unknown fictional address → neutral error, no session |
| Login, two-factor | password alone leaves `/admin` closed (307); TOTP → session |
| Session persistence | reload, second tab, `get-session` |
| Dashboard | Church Admin sections, `noindex`, axe |
| Pages | create → edit → preview (`no-store`, not public; 404 before publish) → publish (ta + en public) → unpublish (404) |
| Sermons | create → edit → publish → public search hit and no-match, out-of-range page, detail page → admin search and empty state → unpublish |
| Events (special meetings) | home address refused; Content Editor drafts and submits (no Publish button) → admin review queue → publish → public in ta + en → unpublish |
| Media | upload a generated fictional JPEG → original not public → delete |
| Roles | Content Editor: no staff, audit, prayer or contact pages, no Publish. Prayer Team: no CMS, media, staff, audit or contact pages |
| Clean-up | unpublishes and deletes only records carrying this run's mark (asserted before each delete); `afterAll` repeats it if a test failed |
| Logout | sign out → `/admin` closed, session gone |

**Safety built into the suite:**
- It refuses to run unless the origin is exactly `https://staging.nltagkuwait.com`, checked again before any credential is typed.
- It refuses any staff address outside `@nltag.test`.
- Credentials are read from environment variables only, never printed.
- Traces, videos and screenshots are off.

**About clean-up:** the CMS "Delete" hides a record from the site and from lists, and a Church Admin can restore it from the Deleted filter. Nothing else is touched, and no data is permanently deleted.

**To run it** (owner decision 10 Nov 2026: the owner runs it; credentials are never sent to Claude), on the owner's own computer:
```bash
STAGING_LIVE_CMS=1 STAGING_ADMIN_EMAIL=admin@nltag.test STAGING_ADMIN_PASSWORD=… STAGING_ADMIN_TOTP_KEY=… \
npx playwright test --config playwright.staging-live.config.ts staging-live-cms --project desktop-1280 --trace off
```

### 12.3 Phone screenshot failures: the cause is not the browser

**Exact pinned browser obtained:**
- `@playwright/test` 1.64.1 pins Chromium revision **1248** = Chrome for Testing **156.0.8078.4**.
- `cdn.playwright.dev` is blocked here, but Google publishes the identical build at `storage.googleapis.com/chrome-for-testing-public/156.0.8078.4/`.
- **New `scripts/pinned-chromium.sh <dir>`** installs it from there, checks `--version`, and is used with `PLAYWRIGHT_BROWSERS_PATH=<dir>`. The preinstalled browser is untouched.

**Result:** on 1248 the same two tests fail with the same 1942 px (2%).

**Root cause (git bisect, each step built and tested on 1248):**
- At `6f8fea0`, when the baselines were approved (1 Nov), all verse baselines **pass** on both 1248 and 1243.
- The first bad commit is **`70af50e`** (Phase 4c, 2 Nov). It only adds SelectField, CheckboxField, Notice, DataTable and ConfirmButton examples **above** the verse cards on the design-system gallery page.
- The cards moved down the page, so on phone (2× pixels) they now render at different sub-pixel offsets. Glyph edges shift, and `verse-square` grows from 390 to 391 px tall.
- The VerseCard component and its CSS are unchanged.
- The old `verse-compact` phone baseline also still shows the pre-approval label "இன்றைய வசனம்". The page correctly shows the owner-approved "இன்றைய தேவ வசனம்".
- These tests are not in CI, so this was never noticed.

**Not done:**
- The approved baselines were not changed and no test was weakened.
- Candidate baselines made on the pinned 1248 are in `docs/reports/staging-acceptance-qa-2026-11/candidate-baselines/`. Side-by-side comparisons: §13.3.
- With them, all 8 visual baselines pass 3 runs in a row on 1248 (and also on 1243).
- **Needs your approval** to replace `verse-compact-phone-390-linux.png` and `verse-square-phone-390-linux.png`.

### 12.4 Schedule row dividers: proposed fix (not applied)

**Cause:**
- `.row` bleeds out by `--space-3` (`margin-inline: -12px`, padding 12px) so its hover tint has room. Its `border-bottom` therefore bleeds out too.
- Measured on the live layout: the top border runs 16→374 px and the row dividers 4→386 px at 390 px. At 1280 px it is 40→1240 against 28→1252.

The approved spec (Phase 1 §6, `other-components.md`) says "editorial rows divided by line-10" and is silent on the bleed.

**Minimal fix** (tokens only, token audit passes; applied in §13.2):
- The row keeps its bleed and hover tint.
- The divider moves to `::after`, inset by `--space-3`, so it runs exactly along the list's top border and the text (16→374 / 40→1240).
- The bottom padding grows by one hairline, so rows keep their exact height (all row heights identical before and after).

**Impact:**
- 192 changed pixels at 390 px (0.04% of the section) and 96 at 1280 px. Only the 12 px line ends change.
- The approved `schedule` baseline **still passes** on phone and desktop (under its 1% threshold), so no baseline changes.
- Before/after: `docs/reports/staging-acceptance-qa-2026-11/schedule-divider-before-after-390.png`.

**Approved 10 Nov 2026 and applied (§13.2).**

### 12.5 SEO descriptions and sharing image: drafts for approval (nothing published)

**How the drafts were built:**
- Only confirmed facts and approved wording: the official names, Kuwait, approved labels (`nav.sermons`, `nav.testimonies`, `schedule.heading`, `section.specialMeetings`, `schedule.timezone`, `sermon.speaker`) and the testimony consent rules.
- No beliefs, history, times or addresses were added.
- Tamil glue words that are not in an approved string are marked; all Tamil below is `draft-review` until you approve it.

**No `/events` page:** special meetings are shown on **Worship times** (`/worship-times`). The "events" description below is written for that page.

| Page | Tamil (draft-review) | English |
|---|---|---|
| Home | புது வாழ்வு தமிழ் AG சபை, குவைத். ஆராதனை அட்டவணை, தேவ செய்திகள், சாட்சிகள் மற்றும் வரவிருக்கும் விசேஷ ஆராதனைகள். | New Life Tamil AG Church in Kuwait. Worship schedule, sermons, testimonies and upcoming special meetings, in Tamil and English. |
| Sermons | புது வாழ்வு தமிழ் AG சபையின் தேவ செய்திகள். தலைப்பு அல்லது பிரசங்கியார் பெயரால் தேடிப் பாருங்கள். | Sermons from New Life Tamil AG Church, Kuwait. Search by title or speaker. |
| Events (Worship times) | புது வாழ்வு தமிழ் AG சபையின் ஆராதனை அட்டவணை மற்றும் வரவிருக்கும் விசேஷ ஆராதனைகள். அனைத்து நேரங்களும் குவைத் நேரம். | Worship schedule and upcoming special meetings of New Life Tamil AG Church. All times are Kuwait time. |
| Testimonies | புது வாழ்வு தமிழ் AG சபையின் சாட்சிகள். ஒவ்வொரு சாட்சியும் சபை வாசித்த பின், எழுதியவரின் அனுமதியுடன் வெளியிடப்படுகிறது. | Testimonies from New Life Tamil AG Church, Kuwait. Each testimony is published with the author's permission after the church has read it. |

- **Length:** 90–140 characters each.
- **New Tamil words** (not in an approved string): `மற்றும்`, `சபையின்`, `தலைப்பு அல்லது … பெயரால் தேடிப் பாருங்கள்`, and the testimony sentence.
- **Once approved:** they go into `ui-strings.ts` as `seo.*` keys and are passed to `pageMetadata(…, { description })`.

**Sharing image direction** (final proposal: §13.4):
- One static, bilingual 1200 × 630 PNG for both languages.
- Approved **Vaigarai** gradient with the approved grain. The image is still; only the hero animates.
- "NLTAG" in small Inter.
- Church name in **Anek Tamil** (display), with the English name beneath in Inter Tight; all text `--color-text-on-gradient`.
- `nltagkuwait.com` at the foot.
- Key content kept in the central 630 × 630 so WhatsApp's square crop keeps the name.
- **Left out:** no logo (concepts not chosen yet), no photos of people, no verse text (permission), no times or address.
- **Wiring:** served as a static file. `og:image` and `twitter:card=summary_large_image` are added in `pageMetadata`, with alt text from the church name.
- When a logo is approved, it replaces "NLTAG".

### 12.6 Forms and privacy: verified

| Check | Result |
|---|---|
| `NLTAG_PUBLIC_FORMS` | Variable present on staging (name only; values are masked by the API). The code enables forms only for the exact value `1` (`forms/service.ts`). Live: `/ta/prayer`, `/en/prayer`, `/en/gallery`, `/en|ta/testimonies/share` and `/admin/prayer` → **404**; Contact has no form, so it is off. |
| No real email | Staging has **no `SMTP_*`** variables, so `getTransport()` can only capture to files (sandbox mode also needs a sandbox SMTP host; Gmail and every other real host are refused at start-up). Every captured subject is prefixed `[STAGING]`, and `NLTAG_CHURCH_INBOX` and the allowlist accept only `@nltag.test` / `example.com`. |
| No real personal data | Live staging content is the `[E2E …]` fixture set; staff addresses are `@nltag.test`; the new live suite refuses any other address. |
| Prayer requests | `prayer.read` is granted only to `CHURCH_ADMIN` and `PRAYER_TEAM` (`policy/permissions.ts`); only Church Admin deletes. Requests are encrypted (AES-256-GCM, `NLTAG_DATA_KEY`); notifications carry no content. Covered by the integration suite (§4). |
| Testimonies | A submission never publishes. "Accept as draft" makes an unpublished draft, and `publishBlocker` refuses Publish until a Church Admin records the author's permission (`cms/rules.ts`). Covered by the integration and admin suites. |

**Controlled staging-only forms test later** (needs your go-ahead for each numbered step):
1. **Access gate first:** decide on hPanel directory protection, or a staff-only form gate (security change, needs review). Without one, turning forms on publishes them to anyone with the staging address.
2. **In hPanel**, staging website only: set `NLTAG_PUBLIC_FORMS=1` and rebuild. The build log must show `Staging check passed …` and the migration step. Confirm `/api/health` is OK.
3. **Submit fictional data only:**
   - Prayer: anonymous, text `[STAGING TEST] prayer`.
   - Contact: name `[STAGING TEST]`, email `visitor@nltag.test`.
   - Testimony: `[STAGING TEST]`, with consent ticked.
4. **Check delivery and access:**
   - In File Manager → `mail-capture`: one `[STAGING]` notification per form, addressed only to `@nltag.test`, and the prayer notification without its text.
   - Sign in as the Prayer Team account and check that Prayer is visible and Contact gives 404.
   - Sign in as the Church Admin and check that all three inboxes are visible. Accept the testimony as a draft, then confirm Publish is blocked until permission is recorded.
5. **Delete** the three test records (Church Admin, "Delete permanently").
6. **Turn off:** set `NLTAG_PUBLIC_FORMS=0`, rebuild, and confirm the 404s again.

### 12.7 Tests run (this follow-up)

| Suite | Result |
|---|---|
| Design system + hero on the **pinned Chromium 1248** | 85 passed, 2 failed (the two stale phone baselines, §12.3), 1 skipped |
| Visual baselines with the candidate baselines (not committed), 1248 ×3 and 1243 ×1 | 8/8 passed each run |
| `schedule` baseline with the proposed divider fix applied (then reverted), 1248 | 4/4 passed |
| Bisect `6f8fea0..0d57240` (build + verse phone baselines on 1248) | first bad `70af50e` |
| `npm run verify` (token audit, Tamil record 226, lint, typecheck, unit, build) | 382 unit tests (27 files) passed, build OK |
| New live suite: list and type check (`--list`, `tsc`, `eslint`) | 20 tests (10 per project; mutating tests desktop-only), compiles, lint clean |

### 12.8 Changes in this follow-up, deployment and production

**Committed** (staging branch only):
- `tests/e2e/staging-live-cms.spec.ts`
- `scripts/pinned-chromium.sh`
- this report and its folder of images and the patch

There are no application code changes, so the staging page output is unchanged.

**Production unchanged:** see the final check below.

**Deployed and verified on live staging:**
- `d5bf575` → Hostinger build `01a1c31b`, completed 01:41 UTC 10 Nov.
- `/api/health` → `{"status":"ok","deployment":"staging","database":true,"stagingVerified":true}`.
- `/ta`, `/en`, `/en/sermons`, `/ta/worship-times`, `/ta/testimonies` → 200 with the STAGING banner.
- Prayer, gallery and testimony-share → 404 (forms off); `/admin` → 307 to sign-in.
- Staging variable names are unchanged (15). `NLTAG_STAGING_BOOTSTRAP_ADMIN_EMAIL` is not set.

**Production: unchanged** (checked after the staging deploy):
- `main` is still `c2301e2`.
- Production build is still `01a1bede` (9 Nov 05:53 UTC), with auto-deploy still on `main`.
- Its 12 variable names are the same (values never read or written).
- Never done: production database access, migrations, emails, accounts or admin changes, merges or PRs.

### 12.9 Remaining approvals (superseded by §13.5)

1. **Staging admin:** do the hPanel steps in §12.1: request, File Manager, password + two-factor, then set the bootstrap variable for one build and remove it.
2. **Live CMS run:** choose how I get the staging-only credentials, or run §12.2 yourself.
3. **Verse phone baselines:** replace the two baselines with the r1248 candidates (§12.3)?
4. **Schedule dividers:** apply the patch (§12.4)?
5. **SEO:** approve or edit the 8 descriptions, including the Tamil glue words (§12.5). Confirm that "events" means the Worship times page.
6. **Sharing image:** approve the direction (§12.5). The logo decision is still open.
7. **Forms:** choose the access gate before any staging forms test (§12.6).

## 13. Owner decisions (10 November 2026) and work done

**Decisions:**
1. The owner creates the staging accounts in hPanel. No links, passwords, codes or credentials are ever sent to Claude.
2. The two verse baselines are kept until the owner explicitly approves replacing them.
3. The schedule divider fix is approved.
4. The four English descriptions are approved exactly as proposed. Tamil stays pending.
5. Prepare the sharing image (design only, not published).
6. `NLTAG_PUBLIC_FORMS=0` stays on live staging. Forms are tested only locally, and no custom access control is added without a security design for approval.

### 13.1 Staging accounts: owner procedure (Church Admin, then Editor, then Prayer Team)

Fictional `@nltag.test` addresses on the **staging website only**. Never open the production website's settings. Don't send any link, password, setup key or code to anyone.

**A. Church Admin `admin@nltag.test`**: follow §12.1 steps 1–7:
- Request on `/en/sign-up`.
- Find the link in File Manager → `nltag-data-staging/mail-capture/`, in the newest `.json` file whose `"to"` is `admin@nltag.test`.
- Set a password and turn on two-factor.
- Add `NLTAG_STAGING_BOOTSTRAP_ADMIN_EMAIL=admin@nltag.test`, then **Rebuild**. Check the build log for `Admin bootstrap: Church Admin role granted`.
- **Delete the variable straight away.**

**B. Content Editor `editor@nltag.test`** (no bootstrap variable):
1. If it isn't already listed, add `editor@nltag.test` to staging's `NLTAG_SIGNUP_ALLOWLIST` (staging website → Environment variables), save and rebuild. This list accepts test addresses only.
2. Open `https://staging.nltagkuwait.com/en/sign-up` in a private window, enter `editor@nltag.test` and send.
3. In File Manager → `mail-capture`, open the newest file whose `"to"` is `editor@nltag.test` and open its link within 1 hour. Set a password.
4. Optional (not required for Content Editors): Account → Two-factor.
5. As `admin@nltag.test`: Admin → **Staff and roles** → "Grant a role" → "Email of a verified account" `editor@nltag.test`, Role **Content Editor** → **Grant role**.

**C. Prayer Team `prayer@nltag.test`**:
1. Steps B1–B3 with `prayer@nltag.test`.
2. Two-factor is **required** for Prayer Team: Account → Two-factor.
3. **Limit:** the Prayer Team role can only be granted while public forms are on (`publicFormsEnabled()`). With `NLTAG_PUBLIC_FORMS=0` the role isn't offered on live staging. The account stays a plain verified account there, and Prayer Team behaviour remains covered by the local staging suite (§4).

**After setup:**
- Run the live suite on your own computer (§12.2). With the editor's details it also checks the review step and the editor's restrictions.
- `NLTAG_STAGING_BOOTSTRAP_ADMIN_EMAIL` must be absent afterwards. I check variable names on every deployment check, and it is absent as of this deploy.

### 13.2 Schedule dividers: applied

- **Change:** `ScheduleList` `.row`. The divider is drawn by `::after`, inset `--space-3`, and the bottom padding becomes `--space-5` + hairline.
- **Unchanged:** existing tokens only, row heights, the hover tint bleed and `tokens.css`.
- **Spec updated:** `docs/design-system/components/other-components.md`.
- **New regression test** `design-system.spec.ts` "schedule list dividers", for `/ta` and `/en` on phone 390 and desktop 1280. On every row it checks:
  - the line starts and ends on the list's edges;
  - the line sits at the row bottom;
  - the row has no border;
  - the extra bottom padding equals the hairline;
  - the row still bleeds 12 px each side.
- **Approved `schedule` baseline:** passes on phone and desktop (Chromium 1248). Unchanged.

### 13.3 Verse baselines: comparison for your decision (nothing replaced)

| File | Shows |
|---|---|
| `verse-compact-original-vs-proposed.png` | original (approved baseline, kept), proposed (r1248), changed pixels in red |
| `verse-compact-label-zoom.png` | the Tamil text difference, 3× |
| `verse-square-original-vs-proposed.png` | the same three panels for verse-square |

All in `docs/reports/staging-acceptance-qa-2026-11/`.

- **verse-compact:**
  - Text difference: the card label. The original shows "இன்றைய வசனம்", the wording from before your 1 Nov approval. The proposed shows the owner-approved "இன்றைய தேவ வசனம்", which is what the site renders today.
  - The longer label shifts the pill slightly. The text below moves by sub-pixel amounts.
- **verse-square:**
  - No text difference: both show "இன்றைய தேவ வசனம்".
  - Only glyph edges at sub-pixel positions change, mostly the first Tamil line, and the image is 390 → 391 px tall.
- **Until you approve:** the existing baselines stay, so these two phone tests keep failing (the known cause, §12.3).

### 13.4 Sharing image: final proposal (not published, not wired)

| File | |
|---|---|
| `og-share-image-proposal-1200x630.jpg` | 80 KB |
| `og-share-image-square-crop-check.jpg` | the central 630 × 630, as WhatsApp may crop it |

**Design:**
- Rendered from the site's own CSS on Chromium 1248, so tokens only: `--gradient-vaigarai`, `--texture-grain` at its approved opacity and blend.
- Text is `--color-text-on-gradient`.
- "NLTAG": Inter, `--text-body-l`.
- Church name: Anek Tamil 300 at `--text-display-xl-ta`, `--leading-display-ta`, on two lines.
- English name: Inter Tight 300, `--text-h1`.
- `nltagkuwait.com`: `--text-body`.
- Centred, so the square crop keeps the whole name.

**Content:**
- The Tamil name is the owner-supplied text, unchanged apart from a line break between "வாழ்வு" and "தமிழ்".
- No logo, photo, verse text, times or address.

**Next, after your approval:** commit it as a static file, add `og:image` (+ width, height, alt) and `twitter:card=summary_large_image` in `pageMetadata`, with a test.

### 13.5 English SEO descriptions: implemented

- **Where:**
  - `src/content/seo.ts` holds the four approved English texts, exactly as proposed. Tamil is `null`.
  - They are passed by `listDescription()` only on `/en`, `/en/sermons`, `/en/worship-times` (events) and `/en/testimonies`.
  - They appear as `<meta name="description">`, `og:description` and `twitter:description`.
- **Tamil:** pages carry no description. The four Tamil drafts remain only in §12.5, pending your review.
- **Other pages:** CMS pages, About, Contact and detail pages keep their own description; none borrows a list text.
- **Tests:**
  - `tests/unit/seo-descriptions.test.ts` (3): wording locked, Tamil `null`, metadata wiring.
  - `tests/e2e/public-site.spec.ts` "list pages carry the approved English description …": the 4 English pages show all three tags; the 4 Tamil pages show none; About, Contact and Ministries don't borrow a list text.
- **Docs:** `docs/backend/cms.md`.

### 13.6 Forms

- No change: `NLTAG_PUBLIC_FORMS` stays as configured (off).
- No access-control code was added.
- A gate, if wanted, will first be presented as a security design for your approval.

### 13.7 Tests (this round)

| Suite | Result |
|---|---|
| `npm run verify` (token audit, Tamil record 226, lint, typecheck, 385 unit tests in 28 files, build) | passed |
| Browser on **Chromium 1248** (`scripts/pinned-chromium.sh`): design-system, hero, public-site (unseeded), accounts-gate, phone 390 + desktop 1280 | 192 passed, 22 skipped (the suites' own), **2 failed: the known verse phone baselines, kept by your decision** |
| Of those: approved `schedule` baseline (phone + desktop), new divider tests (4), new description test (2) | all passed |
| `npm run test:integration` (MariaDB) | **not run this round**: no MariaDB in this session. The changes touch no database or server code (CSS, page metadata, content constant, tests). |
| Live staging after deploy | see §13.8 |
