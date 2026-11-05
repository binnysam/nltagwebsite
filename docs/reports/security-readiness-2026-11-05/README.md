# NLTAG final security-readiness review (5 Nov 2026)

**For owner review. Nothing was deployed, merged, migrated, activated or changed in production.** The review read `main` at `1d3ffb6`, ran tests only against scratch MariaDB 11.8.9 databases on 127.0.0.1, and changed no repository code.

> **New finding (item 4): the forgot-password request leaks whether an account exists when the database is slow.**
> - Above about 25 ms per database round trip, an address with an account answers later than one without. At 50 ms the gap is +208 ms.
> - It is masked at normal database speed.
> - It needs an owner decision before the first Church Admin is activated (§4).

## Summary

| # | Item | Result |
|---|---|---|
| 1 | PR #23 (D16 results) | **Complete and accurate; no secrets or production data.** Verdict reproduced exactly. Two wording corrections and two gaps (§1). Its CI is red from the known raw timing-test flake, not from its contents. |
| 2 | Draft PR #22 | **Recommend merging,** with your approval, in the next planned deploy. Test-only and green, and the flake recurred on 4 Nov in a new shape that this diagnostic would explain (§2). |
| 3 | #13, #16, #17, #18, #19, #20, #21 in `main` | **All present.** Each is an ancestor of `main`, its code is intact, and `main` CI is green (§3). Which commit Hostinger serves could not be checked from here. |
| 4 | Password-reset timing | **Finding:** an account-existence signal under slow-database conditions (§4). Fix options are proposed; none is implemented. |
| 5 | Migration 0003 | **Not applied to production,** per every repo record. It blocks only Church Admin activation; public pages never touch the affected table or column (§5). Production could not be queried from here. |
| 6 | Hostinger environment | Checklist in §6: owner-run, names and states only. |
| 7 | Tamil awaiting approval | **8 D9 strings** listed in §7, verified identical in code and the review record. Four other `draft-review` strings are listed for completeness. |
| 8 | Launch readiness | §8: public-website blockers kept separate from Church Admin and membership blockers. |

---

## 1. PR #23: D16 published results

**Accuracy: reproduced independently.**
- **Method:** a fresh clone of the PR head (`217588c`), using `main`'s `scripts/d16/pooled.mjs`, byte-identical to `1d3ffb6`.
- **Verdict:** the recomputed `pooled-summary.json` equals the published one apart from timestamps. Verdict **PASS**, exit 0.
- **Per run:**
  - `analyze.mjs` reproduces each run's `summary.json` byte for byte;
  - every run has 2,400 rows with contiguous sequence numbers, 600 rounds, all four classes in every round, every class leading some round, and every status `401`.
- **Scope of the PR:** it changes only `docs/reports/d16-timing/`. There is no change under `scripts/`, `src/` or `tests/`.

**Exposure: nothing sensitive.** Every file the PR adds was scanned.

| Looked for | Found |
|---|---|
| Credentials, `mysql://` URLs, keys, tokens | none (the only hits are prose such as "wrong password") |
| Email addresses | none |
| IP addresses | `127.0.0.1` and `0.0.0.0`; `192.0.2.2`, the sandbox's own RFC 5737 documentation-range address |
| Ports | `2024`, `41011` and `41991`, the sandbox's infrastructure and proxy ports |
| Hostnames | `mirror.gcr.io` (the database image source) |
| Long identifiers | the commit SHA, a public image digest, and the sandbox boot ID |
| Commit authors | `Claude <noreply@anthropic.com>` only |

- No Hostinger host, production variable, database name or path appears.
- **Optional:** the proxy port numbers could be removed for tidiness. They identify nothing outside the throwaway sandbox.

**Completeness: two gaps, already disclosed in the PR.**
1. **Smoke-test folder.** The raw folder of the pre-flight smoke test (`smoke-1`) is not published; it was lost with an earlier sandbox.
2. **P1 server logs.** These stay local, as the plan says.
   - The three logs (about 126 KB each) are in this session's scratch space, which survived the sandbox restart of 5 Nov.
   - They contain no secrets or addresses, only sandbox paths, so they are safe to publish.
   - They will be lost when this session's container is reclaimed. **Decision needed:** publish them, or let them go.

**Wording corrections (made on 5 Nov 2026, as the owner asked; the D16 data is unchanged):**
- The README called `mirror.gcr.io` "Docker Hub's official mirror". It is **Google's** mirror of Docker Hub's official images.
- "Copies … are kept in the session sandbox" was true only until the session ends. The logs are not published; that needs the owner's explicit approval.

**CI on PR #23 is red.**
- **Run:** 41933839419, `verify` job.
- **Failing test:** `tests/integration/r4-timing.test.ts` "raw (no floor)", with `expected 455.6 to be less than 400`.
- **Cause:** the PR changes only Markdown, CSV and JSON. This is the known intermittent raw-test failure, discussed in §2.

## 2. Draft PR #22: recommendation

**What it does**
- It changes one file, `tests/integration/r4-timing.test.ts`: +30 / −2.
- The two removed lines are a destructuring line and a comment. Every `expect()`, the 400 ms floor, `n = 100` and the floored and flood tests are unchanged. This was checked in the diff.
- After each raw probe pair, it measures a control: one Better Auth `hashPassword` (`scryptMs`) and one `SELECT 1` (`dbMs`). The control is printed on every run, and its per-pair series is printed when the test fails.
- It decides nothing.

**Evidence**

| Check | Result |
|---|---|
| CI on its head `6a6c039` (run 41905955122) | verify ✅, admin-browser ✅, public-browser ✅ |
| Local, MariaDB 11.8.9: `npm run test:integration` on `6a6c039` | 251/251 plus 6/6 |
| Local: the timing file 10 more times | 10 of 10 pass |
| Raw known probes, across those 11 runs | median 106.7–118.7 ms, maximum 134.8–207.9 ms |
| Control | scrypt median 86–95 ms; database median about 1 ms |

The full set is in `pr22-local/r8-lines.txt`.

**Why merge it now:** the raw test failed again on 4 Nov, in a new shape.

| Occurrence | Code | Known p99 | Shape |
|---|---|---|---|
| run 41820997338 | `7bcedde` | 460.1 ms | both classes slow |
| run 41889690214 | `2b1c7a0` | 774.5 ms | both classes slow |
| **run 41933839419** | **`1d3ffb6` code (PR #23)** | **455.6 ms** | **known only** |

In the 4 Nov failure:
- **Known slow, unknown normal:** the three slow known probes (312.7, 455.6 and 309.6 ms, in pairs 52, 56 and 77) each sat next to a normal unknown probe of about 97–109 ms.
- **Counts:** 11 known probes but only 2 unknown probes were over 150 ms.
- **Event loop:** delay maximum 24.5 ms.

PR #22's working explanation ("the CI runner slowed down, so both classes slow together") **does not fit this occurrence**.
- **Still undetermined:** whether it is database write contention on the known path or something in the sign-in path itself.
- **Follow-up, 5 Nov 2026:** see `raw-timing-flake/README.md`.
  - Across both diagnosable failures the spikes hit single probes, and known probes about 2.5 to 5 times as often.
  - A runner-wide slowdown that hits every probe alike is rejected (pooled p = 0.0008).
  - The split fits short database stalls on the path that writes about 2.5× more (measured: 6.6 writes per known probe, 2.6 per unknown).
- **What PR #22 adds:** its control would show which, next time. Slow probes with normal controls point to the sign-in path.
- **Why this is not a production timing finding:** the raw test runs with the floor at 0. The production path keeps the 400 ms adaptive floor, and the D16 saturation runs (Rules A–E) passed with it. It still deserves to be understood.

**Recommendation**
- **Approve and merge PR #22,** preferably together with the next planned deploy, since merging deploys an identical app.
- **Do not change the assertion.**
- **Consider adding a write round trip to the control** in step 2, as a separate decision. The new failure points at write paths, and `SELECT 1` does not exercise them.

Merging is your decision; nothing was merged.

## 3. Security fixes in `main`

`origin/main` is `1d3ffb6`. Its CI (run 41900932529) is ✅.

| PR | Merge commit | Ancestor of `main` | Defining code in `main` | Later changes to its files |
|---|---|---|---|---|
| #13 M1 option B | `7bcedde` | yes | `verification: { storeIdentifier: "hashed", disableCleanup: true }` (`src/server/auth/auth.ts:153`), `verification-purge.ts`, the m1 tests. **105/105** added `src/` lines present | #20 only |
| #16 D16 harness, 401-only sample | `2b1c7a0` | yes | `scripts/d16/*`; `clearKClassWindows` in `r4-timing.test.ts` | #21 only |
| #17 purge-race retry | `ddecb2c` | yes | `VANISHED_ROW_ATTEMPTS` retry in `rate-limit.ts`; **42/42** added lines present | #18 only |
| #18 primary-key purge | `0d77c75` | yes | `BUCKET_PURGE`, `selectExpiredBucketKeys`, READ COMMITTED primary-key delete; **90/90** | none |
| #19 raw sample | `eb6cccb` | yes | `sampleRaw()` and `resetTimingEstimatorForTests` in `r4-timing.test.ts` | #16 only |
| #20 Finding 3 | `21c4b3a` | yes | `isKnown()` does the user lookup first, for every address (`auth-abuse-gate.ts:352–354`); **12/12** | none |
| #21 D16 tooling | `1d3ffb6` | yes (`main` HEAD) | `stats.mjs` `PLAN` (600 probes, seed 20261104), `pooled.mjs`, runbook §10 per-address check | none |

- **No reverts:** every later change to a fix's files came from another PR in this same list.
- **Not verified from here: which commit production serves.** This sandbox's network policy blocks `nltagkuwait.com`, and the Hostinger connector is not authorised.
  - **Owner check:** the latest Hostinger build log names commit `1d3ffb6` and shows `No migration requested` and `No admin bootstrap requested`.

## 4. Password-reset request timing (separate item): finding

**Code path** (`main`; Better Auth 1.7.15 `dist/api/routes/password.mjs`):
- **The gate** (`resetRequest()`, `auth-abuse-gate.ts:430`):
  - per-address `reserveWindow` (`reset-req:<hash>`, 5 per 15 min);
  - then Better Auth;
  - then a hold to `max(250 ms, 1.1 × the largest recent sign-in password-work sample)`. It passes no `commonMs`, and the estimator is fed only by sign-in work.
- **Better Auth, no account:** `findUserByEmail`, then `findVerificationValue("dummy…")`. That is **two reads**.
- **Better Auth, account exists:**
  - `findUserByEmail(…, includeAccounts)`;
  - `createVerificationValue`, an **INSERT and commit**;
  - our `sendResetPassword` callback, which runs **another `account` SELECT** and is awaited, before the mail is queued in the background.

  That is about **four more round trips, one of them a write**.

**Measured** with a scratch harness modelled on the Finding 3 harness:
- one process, the real `/api/auth` route and hold, 40 interleaved rounds;
- every answer `200`;
- the latency proxy from `scripts/d16/finding-3/latency-proxy.mjs`;
- scratch database `rt_test`.

| Added latency per database round trip | U median (ms) | K − U | L1 − U | L2 − U |
|---|---|---|---|---|
| 0 | 250.6 | −0.3 [−0.5, −0.0] | −0.2 [−0.4, −0.0] | −0.3 [−0.6, −0.2] |
| +20 ms | 250.2 | −0.1 [−0.4, +0.2] | −0.4 [−0.6, 0.0] | −0.2 [−0.5, 0.0] |
| **+30 ms** | 250.2 | **+40.3 [39.7, 40.8]** | **+40.1** | **+39.6** |
| **+50 ms** | 265.3 | **+208.1 [206.7, 209.6]** | **+208.4** | **+207.0** |

- **Classes:** U = no account; K = account, not allowlisted; L1 = allowlisted, requested, no password; L2 = allowlisted with a password (staff shape).
- **Intervals:** bootstrap 95 %.
- **Evidence files:** `reset-timing/` holds the CSVs, `summary.txt` and the scratch probe source as `.txt`. The probe was not added to the test suite.

**What it means:**
- **Normal conditions:** the 250 ms floor fully masks the difference while a round trip stays at or below about 20 ms. That is the normal case for Hostinger's local MariaDB, where a round trip is about 1 ms.
- **Slow database:** at about 25–30 ms or more per round trip, any address with an account answers 40–200+ ms later. One request then tells an observer whether an account exists, which is what this endpoint is designed never to reveal.
- **What is not revealed:** allowlist status. L1 and L2 match K.
- **Masked under a sign-in flood:** the shared estimator raises the hold to about 1 s, as seen in D16.
- **Exposed when:** the database is slow but the sign-in path is quiet.
- **Exposure today:** none. Accounts are off and `/api/auth` returns 404.
- **Exposure after activation:** staff accounts become discoverable under slow-database conditions, and 5 requests per 15 minutes per address is enough to test an address.

**Fix options (owner decision; nothing implemented):**

| Option | What | Notes |
|---|---|---|
| **A (recommended)** | Answer the reset request at once with the same 200 for every address, and run the Better Auth reset work in the background. | This is the pattern already used by `/api/account-request` (D1: "replies 202 before reading the address"). The answer time no longer depends on the address or the database. Needs a small gate change and tests: a statement-order test like #20's, plus this harness. |
| B | An adaptive reset hold: a per-process estimator of recent account-branch durations × 1.1, like the sign-in estimator. | Smaller change, but statistical. A first slow request after a quiet period still leaks. |
| C | Make the no-account branch do the same database work: account lookup, plus inserting and deleting a dummy verification row. | Mirrors the Finding 3 fix, but is fragile against Better Auth changes and adds writes. |

**Recommendation:** Option A, on its own PR, before the first Church Admin activation, and confirmed with this harness at +0, +30 and +50 ms.

## 5. Migration `0003_two_factor`: status (nothing applied)

**What the migration is**
- `drizzle/0003_two_factor.sql` creates the `two_factor` table and adds `user.two_factor_enabled BOOLEAN NOT NULL DEFAULT false`, plus a foreign key.
- It is additive. The file header says: "Production: not applied."
- `drizzle/meta/_journal.json` lists entries 0–3.

**Recorded production state**
- Every record in the repo says it is not applied: `docs/backend/data-and-auth.md:233`, `HANDOFF.md` §10, and `admin-activation.md` §0 and §2.
- §1 of the runbook expects `__drizzle_migrations` to have **3** rows (`0000`–`0002`) before the step.
- `0001` and `0002` were applied on 2 Nov 2026 with approval.
- No record of `0003` being applied exists.

**What depends on it**
- Only auth and admin code reads the `user` table: `auth.ts`, `auth-abuse-gate.ts`, `request-account.ts`, and `session.ts` through Better Auth.
- `getCurrentUser()` is called only from admin pages and the account two-factor page. All of them are behind `accountsEnabled()`, which returns 404 in production.
- Public pages read only `src/server/cms/public*.ts`.
- **So the public site does not need 0003. Church Admin activation does.** Turning accounts on without it would break sign-in, because Better Auth reads `two_factor_enabled`.
- The runbook already orders it correctly: §2 applies 0003 in one owner-approved build with `NLTAG_APPROVED_PRODUCTION_MIGRATION=1` after a verified backup in §1; accounts are opened in §3.

**Owner check (read-only, phpMyAdmin)**
- `SELECT * FROM __drizzle_migrations;` should show 3 rows.
- `SHOW TABLES LIKE 'two_factor';` should return nothing.

I could not query production from here, and per the standing rules I did not try.

## 6. Hostinger production environment checklist (owner-run; names and states only, never values)

**Where:** hPanel → Websites → nltagkuwait.com → Node.js app → Environment variables. Saving restarts the app.

| Variable | Now (public site, accounts off) | At Church Admin activation | Must never be |
|---|---|---|---|
| `DATABASE_URL` | set: `mysql://` to `u339364475_nltag` on 127.0.0.1:3306 | unchanged | containing `nltag-local-dev-only` or `ci-only` |
| `BETTER_AUTH_SECRET` | set, ≥ 32 random characters | unchanged; **never rotated after anyone enrols** (it encrypts the authenticator secrets) | containing `test-only` or `harness-only` |
| `BETTER_AUTH_URL` | `https://nltagkuwait.com` | unchanged | http, or another host |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | all four of host, user, pass and from, or none | all set (required for accounts) | loopback host; user or pass `harness` |
| `EMAIL_DAILY_CAP` | `300` | unchanged | above 450 (refused) |
| `NLTAG_ACCOUNTS_ENABLED` | **`0`** | `1` only in the activation window (runbook §3) | `1` before 0003, the reset-timing decision (§4) and the D9 Tamil approval |
| `AUTH_RATE_LIMIT` | absent | **`on`** (accounts stay 404 without it) | `off` (refused in production) |
| `NLTAG_SIGNUP_ALLOWLIST` | absent | the first admin's address only | anything broader at first activation |
| `NLTAG_APPROVED_PRODUCTION_MIGRATION` | **absent** | `1` for **one** build (§2), then deleted and rebuilt | left set; set in the same build as the bootstrap |
| `NLTAG_BOOTSTRAP_ADMIN_EMAIL` | **absent** | for **one** build (§7), then deleted and rebuilt (§8) | left set |
| `NLTAG_RECOGNISED_BROWSER_KEY_VERSION` | absent, or a positive integer | same; raise it to revoke recognised browsers | any other value (no browser is then recognised) |
| `CLIENT_IP_SOURCE`, `CLIENT_IP_PROXY_HOPS`, `CLIENT_IP_CROSSCHECK`, `CLIENT_IP_HEADER`, `CLIENT_IP_SHAPE_LOG` | **absent** (standing rule) | absent | set without a reviewed capture; `CLIENT_IP_CROSSCHECK=none` is refused |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | absent (Google sign-in not configured; `auth.google` is still draft Tamil) | absent | only one of the pair |
| `NODE_TLS_REJECT_UNAUTHORIZED` | absent | absent | `0` (the site refuses to start) |
| `NLTAG_LOCAL_MAIL_OUTBOX`, `NLTAG_DESIGN_SYSTEM_GALLERY` | absent | absent | `1` in production (the gallery page would appear) |
| `NLTAG_MEDIA_DIR` | absent (default `/home/u339364475/nltag-data/media`) or that absolute path | unchanged | a relative path |
| `NEXT_MANUAL_SIG_HANDLE` | absent | **open decision** (graceful shutdown, HANDOFF §10): decide and test before activation | set without testing |
| `NLTAG_APPROVED_SMTP_TEST`, `TRUSTED_PROXIES` | obsolete: delete if still present | — | — |

**Other owner checks**
- **Build log:** the latest log shows commit `1d3ffb6`, `No migration requested` and `No admin bootstrap requested`.
- **Runtime log:** shows `[nltag-media-storage] … writable: true`.
- **Live pages:**
  - `/ta` and `/en` page source contains `noindex, nofollow`;
  - `/ta/sign-in`, `/ta/sign-up`, `/admin` and `/api/auth/get-session` show Not Found.
- **Backups:** a recent database backup exists and is verified.
- **Old trial app:** the remediation checklist's §4 secret rotation and §6 data inventory are unchecked in the repo. The replacement report is in the claude.ai project.
  - Confirm that the old app's secrets were rotated or retired: `DATABASE_URL`, `MONGODB_URI`, `RESEND_API_KEY` and `ADMIN_JWT_SECRET`.
  - Confirm that any data it collected through `/api/membership`, `/api/prayer` or `/api/contact` was handled.

## 7. Tamil strings awaiting approval

These are the **8 R4 D9 strings**. They are `draft-review`, and gate G-D says they need approval before the first Church Admin activation. Text from `src/content/ui-strings.ts` on `main`; each matches `docs/content/tamil-content-review.md` exactly (checked by script).

| # | Key | English | Tamil (draft) |
|---|---|---|---|
| 1 | `auth.accountRequest.hint` | We will email you a link to choose your password. | உங்கள் கடவுச்சொல்லைத் தேர்ந்தெடுக்க ஒரு இணைப்பை மின்னஞ்சலில் அனுப்புவோம். |
| 2 | `auth.accountRequest.sent` | Check your email. If this address can be registered, we have sent a link to choose your password. It works for 1 hour. | உங்கள் மின்னஞ்சலைப் பாருங்கள். இந்த முகவரியைப் பதிவு செய்ய முடிந்தால், உங்கள் கடவுச்சொல்லைத் தேர்ந்தெடுக்க ஒரு இணைப்பை அனுப்பியுள்ளோம். அது 1 மணி நேரம் செல்லுபடியாகும். |
| 3 | `auth.accountRequest.retry` | The email may take a few minutes to arrive. If nothing arrives within 10 minutes, please request again. | மின்னஞ்சல் வர சில நிமிடங்கள் ஆகலாம். 10 நிமிடங்களுக்குள் எதுவும் வரவில்லை என்றால், மீண்டும் கோருங்கள். |
| 4 | `auth.setPassword.title` | Choose your password | உங்கள் கடவுச்சொல்லைத் தேர்ந்தெடுக்கவும் |
| 5 | `auth.setPassword.submit` | Save password | கடவுச்சொல்லைச் சேமி |
| 6 | `auth.setPassword.done` | Your password is set. Please sign in. | உங்கள் கடவுச்சொல் அமைக்கப்பட்டது. உள்நுழையவும். |
| 7 | `email.setPassword.subject` | Set your password | உங்கள் கடவுச்சொல்லை அமைக்கவும் |
| 8 | `email.setPassword.body` | An account has been requested for this email address. Open the link below to choose your password. It works for 1 hour. | இந்த மின்னஞ்சல் முகவரிக்கு ஒரு கணக்கு கோரப்பட்டுள்ளது. உங்கள் கடவுச்சொல்லைத் தேர்ந்தெடுக்க கீழே உள்ள இணைப்பைத் திறக்கவும். அது 1 மணி நேரம் செல்லுபடியாகும். |

The English of all eight is also `proposed`, not confirmed.

**Also `draft-review`:** 14 keys use the draft helper. Two of them, `lang.ta` and `lang.en`, are explicitly confirmed, which leaves 12 draft strings: the 8 above and these 4.
- `auth.google` and `auth.or`: shown only if Google sign-in is configured, and it is not.
- `email.signInThrottled.subject` and `email.signInThrottled.body`: the alert email, sent English-only until approved.

**Not on this list:** the pre-launch checklist's 7 formatter items (weekday names, recurrence wording and the date format) are a separate public-launch approval, covered in §8.

## 8. Launch readiness

### A. Public website launch (removing `noindex`, publicising the site)
The new site is deployed (2 Nov 2026), `noindex, nofollow`, with accounts off. It needs none of the account work: not migration 0003, not the D9 Tamil, not the reset fix.

**Blockers, all owner decisions or owner actions:**
1. **The decision to remove `noindex`.** This is SEO strategy. `robots: { index: false, follow: false }` is set in `src/app/[locale]/layout.tsx:21` and `_components/site.ts:57`. Hreflang, sitemap and canonical checks follow (`nl-tag-seo`). **Not changed.**
2. **Church content marked `CONTENT REQUIRED`,** for example the hero welcome copy (pre-launch checklist #12). Nothing may be invented.
3. **Tamil formatter wording and the date format** (pre-launch checklist #1–7).
4. **Bible text.** The verse card stays a placeholder until reproduction permission and credit lines are documented (#9). Either accept the placeholder at launch or obtain the permission.
5. **The hero check on a real low-end Android phone** (#10).
6. **Live-site verification by the owner** (§6 "Other owner checks"), and confirmation that production serves `1d3ffb6`.
7. **The old trial app's secret rotation and data handling** confirmed (§6).
8. **Recommended:** a decision on repository visibility (#11; it is currently public), and checking the Hostinger Node 22 patch version (#8).

**Not a blocker for the public launch:** the raw timing-test CI flake. Note that red CI makes every later merge harder to judge.

### B. Church Admin activation (staff accounts; runbook `admin-activation.md`)
1. **Reset-request timing (§4):** decide on the fix, implement it on its own PR, and verify it with the harness. **New.**
2. **The 8 D9 Tamil and English strings approved** (gate G-D, §7).
3. **Migration 0003:** a verified backup, then one approved build (runbook §1–2).
4. **The R4 environment checklist** (§6), including `CLIENT_IP_SOURCE` unset and no harness values.
5. **D16 accepted by the owner** (PR #23, PASS), and gate G-E: the first activation approved.
6. **`NEXT_MANUAL_SIG_HANDLE` / graceful shutdown on Hostinger:** decide and test (HANDOFF §10).
7. **Runbook §0 corrections. Made on 5 Nov 2026 in this PR,** as the owner asked:
   - the M1 checkbox is marked decided (PR #13, `7bcedde`);
   - the Tamil line now lists all 12 `draft-review` strings: the 8 D9 strings, the 2 alert strings, and `auth.google` and `auth.or`;
   - the "PR #10" check is replaced by a check of the current `main` build.
8. **Accept or schedule the low-severity items from the independent review (HANDOFF §10):**
   - L1: G2 guard gaps;
   - L2: env guard runs on first use, and loopback variants;
   - L3: a possible duplicate mail on SMTP retry, and a 35 s retry span longer than the 10 s drain;
   - L4: a failed mail does not release the slot;
   - L5: two live links used at the same instant;
   - L6: no production-config G1 test;
   - L7: a malformed request shows "check your email".

   D18, the durable outbox, stays deferred: accepted risk, needs migration 0004.
9. **Recommended:**
   - merge PR #22 (§2);
   - add a CI job for `auth.spec.ts`, the mailbox-first browser test, which is local-only today. This is a workflow change that needs approval.

### C. Membership activation
**Not authorised and not built.** Phase 4d, the membership interface, is "not authorised" (CLAUDE.md). The admin has no membership screens, and the runbook's §10 checks confirm `/admin/members`, `/admin/membership` and `/en/account/membership` return Not Found.

Blockers:
1. **Owner authorisation of Phase 4d.**
2. **Membership policy and privacy decisions** (`nl-tag-membership`): applications, verification, approval, IDs, birthdays and data retention.
3. **Design, build and review,** with new Tamil strings approved.
4. **Church Admin activation (B) first,** since membership approval is an admin function.
5. **Its own security review,** covering personal data, export and access control.

Membership registration stays **disabled**.

---

**How this review was done**
- `main` was read with `git show origin/main:<path>` and `git archive`.
- PR #22 ran in a detached worktree at `6a6c039`, and the reset probe in a detached worktree at `1d3ffb6` with untracked scratch files.
- Databases: scratch MariaDB 11.8.9 containers (`mirror.gcr.io/library/mariadb:11.8.9`) published only on `127.0.0.1:3308`, databases `nltag_test` and `rt_test`, with random local-only passwords and fictional `@nltag.test` addresses.
- The live site and Hostinger were **not** contacted: this sandbox's network policy blocks `nltagkuwait.com`, and the Hostinger connector is not authorised.
