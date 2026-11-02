# SMTP Stage A — one-time delivery test (TEMPORARY)

Owner request, 2 Nov 2026. Sends **one** dedicated bilingual *email delivery test* message through the production Gmail SMTP configuration to a church-controlled address, while the accounts gate stays closed (`NLTAG_ACCOUNTS_ENABLED=0`). Covers tests A1–A4 of the SMTP readiness report. **Remove this mechanism in a separate reviewed PR after the test succeeds** (see "Removal").

## How it works
- `scripts/hostinger-build.mjs` runs it **after** a successful `next build`, and only when `NLTAG_APPROVED_SMTP_TEST=1` is set for that build. Normal builds print `No SMTP delivery test requested` and do nothing.
- Rules and the message: `src/server/email/smtp-delivery-test.ts`. Runner: `scripts/email/smtp-delivery-test.ts` (`npm run email:smtp-test`). Tests: `tests/unit/smtp-delivery-test.test.ts`.
- Uses the existing transport (`src/server/email/transport.ts`, TLS 1.2+). The sender is `SMTP_FROM`, added by the transport.

## The test email
A dedicated message, **not** the account verification email:

| Part | Content |
|---|---|
| Subject | `NLTAG இணையதளம் — மின்னஞ்சல் விநியோகச் சோதனை · NLTAG website email delivery test` |
| Tamil block (first) | Says this is a test message confirming that emails sent by the church website are delivered, and that no action is needed. Then `இணையதளம்: https://nltagkuwait.com/ta` |
| English block (second) | The same in English. Then `Website: https://nltagkuwait.com/en` |
| Footer | "Sent automatically by the New Life Tamil AG Church website", Tamil then English (existing footer string) |

No "verify your email" wording, no expiry, **no token, no account, no database access.** The only links are the two labelled homepage links. Plain HTML: no images, tracking or remote assets.

Wording lives in `src/content/ui-strings.ts` (`email.smtpTest.*`). The Tamil is `draft-review` like the other account emails; the owner may change it before the test.

## Safety rules — refusals (nothing sent, nothing written)
Each of these is checked **before any attempt**. A refusal writes no marker and sends nothing, so the owner fixes the cause and rebuilds with the **same** run id.

| Rule | Why |
|---|---|
| `NLTAG_APPROVED_SMTP_TEST` must be exactly `1` | Off by default; explicit owner approval per build |
| Production only, and `NLTAG_ACCOUNTS_ENABLED` must **not** be `1` | Stage A is gate-closed only |
| Not in the same build as `NLTAG_APPROVED_PRODUCTION_MIGRATION=1` | One change per build (the build script refuses before doing anything) |
| All four `SMTP_*` set, `SMTP_USER` = `newlifetamilassembly@gmail.com`, `SMTP_FROM` = `New Life Tamil AG Church <newlifetamilassembly@gmail.com>` | Correct sender, and Gmail does not rewrite it |
| `BETTER_AUTH_URL` exactly `https://nltagkuwait.com` | The site origin of the links; checks the masked value |
| `NLTAG_SMTP_TEST_TO` = the church mailbox or `newlifetamilassembly+<tag>@gmail.com` | Only church-controlled; one address; no header injection |
| `NLTAG_SMTP_TEST_RUN_ID` (3–40 chars, `a-z 0-9 -`) | Names this approval |
| The transport in use must be SMTP; the server environment must be valid | Never the development outbox |
| The marker folder must be outside the deployment and any web root, and writable | If the attempt cannot be recorded, it is not made |

## Duplicate-send guard — attempts
Immediately before sending, the marker `/home/u339364475/nltag-data/ops/smtp-test-<run id>.json` (folder `700`, file `600`) is created **exclusively** with status `attempting`. **From that moment the run id is spent:** whatever happens next — accepted, rejected, timed out, build stopped — no later build will ever send for that run id. Two builds running at the same time cannot both send (only one can create the marker). After the send, the marker records `sent`, or `failed` with a short code. It never holds an address or secret.

**Do not delete or rename marker files while this mechanism exists** — that would make the run id usable again. They are removed (optionally) only after the mechanism itself is removed.

## When a new run id is needed
| Build log line `[nltag-smtp-test] …` | Was an email attempted? | What to do | Run id |
|---|---|---|---|
| `REFUSED before any attempt, nothing sent: …` | No | Fix what the reason names, rebuild | **Same** run id is fine |
| No `[nltag-smtp-test]` line; the build failed earlier (e.g. `next build`) | No | Fix the build, rebuild | **Same** run id is fine |
| `accepted by SMTP for the church mailbox (+tag)` | Yes, accepted | Remove the variables; check the inbox (step 7) | Spent. Another test is a **new approval** with a **new** run id |
| `FAILED (CODE)` | Yes, rejected or interrupted | Check Inbox **and Spam** first (a timeout can still deliver). Fix the cause | **New** run id required |
| `was already attempted (…)` | Not now — an earlier build did | Nothing was sent now. If you meant a new attempt, check the inbox, then set a new id | **New** run id required |
| Build stopped or no result line after the test step started | Possibly | Treat as attempted. Check Inbox and Spam. The next build with this id will report `started but never recorded a result` | **New** run id required |

Rule of thumb: **refused = same id; anything else = new id.** Number them in order — `stage-a-1`, `stage-a-2`, … — and never go back to an earlier one.

## Build log and exit status
The build log shows one line starting `[nltag-smtp-test]`. It never contains the address (only `church mailbox (+tag)`), SMTP settings, passwords or server responses — on failure only a short code such as `EAUTH:535` or `ETIMEDOUT`.

A refusal or a failed send **fails the build**: Hostinger keeps the previous release live. "Already attempted" sends nothing and does **not** fail the build, so variables left in place never block normal deployments.

## Owner steps
Before starting: this PR is merged and deployed, SMTP variables are set (readiness report §3–4), `NLTAG_ACCOUNTS_ENABLED=0`.

1. hPanel → Websites → **nltagkuwait.com** → Node.js / Web App → **Environment variables**. Use **hPanel's editor** (the API replaces the whole set and would erase the masked secrets).
2. Check without changing: `NLTAG_ACCOUNTS_ENABLED` is `0`; `BETTER_AUTH_URL` is `https://nltagkuwait.com`; `NLTAG_APPROVED_PRODUCTION_MIGRATION` is **not** present.
3. **Add** three variables:

   | Name | Value |
   |---|---|
   | `NLTAG_APPROVED_SMTP_TEST` | `1` |
   | `NLTAG_SMTP_TEST_TO` | `newlifetamilassembly+webtest@gmail.com` (or another `+tag`) |
   | `NLTAG_SMTP_TEST_RUN_ID` | `stage-a-1` (first attempt; see "When a new run id is needed") |
4. **Apply changes / Save and redeploy.** Hostinger rebuilds. (If saving does not start a build, use **Redeploy** on the latest deployment.)
5. Wait for the build to finish. Open the build log, find the `[nltag-smtp-test]` line and follow the table above:
   - `accepted by SMTP …` → step 6.
   - `REFUSED …` → fix the named variable, keep the same run id, back to step 4.
   - `FAILED (CODE)` → check Inbox and Spam. `EAUTH:535` = App Password wrong/revoked; `ETIMEDOUT`/`ESOCKET` = port blocked (try `SMTP_PORT=587`). Fix it, change `NLTAG_SMTP_TEST_RUN_ID` to the next id (`stage-a-2`), back to step 4.
   - `already attempted` → you reused a spent run id; nothing was sent. Set the next id if a new attempt is intended.
6. **Immediately remove** the three `NLTAG_*SMTP_TEST*` variables in hPanel and apply. (Even if forgotten, the marker stops a second send for the same run id.)
7. In the church Gmail inbox check (readiness report A2–A4):
   - In **Inbox**, not Spam, within a minute; From **New Life Tamil AG Church** `<newlifetamilassembly@gmail.com>`; subject reads "NLTAG … மின்னஞ்சல் விநியோகச் சோதனை · NLTAG website email delivery test".
   - Tamil block first, English second; Tamil renders correctly in Gmail web **and** the phone app.
   - No verification wording; the only links are the labelled website links `https://nltagkuwait.com/ta` and `/en`, and they open the Tamil and English homepages.
   - ⋮ → **Show original**: `SPF: PASS`, `DKIM: PASS`, `DMARC: PASS`.
8. Public site still normal: `/ta` and `/en` load; `/ta/sign-up`, `/ta/sign-in`, `/ta/admin`, `/api/auth/get-session` still 404.
9. Tell Claude the result (pass/fail per item) and the run id used. Do not paste the email source, headers with addresses, or any password.

## Removal (separate reviewed PR, after the test passes)
Delete `src/server/email/smtp-delivery-test.ts`, `scripts/email/smtp-delivery-test.ts`, `tests/unit/smtp-delivery-test.test.ts`, this document, the `email:smtp-test` script in `package.json`, the three `email.smtpTest.*` strings in `src/content/ui-strings.ts` (then `npm run review:tamil`), and the SMTP-test block and combined-build refusal in `scripts/hostinger-build.mjs`; remove the references in `docs/operations/hostinger-deployment.md`, `docs/backend/data-and-auth.md` and `CLAUDE.md`. Confirm the three variables are gone from hPanel. Only after that removal is deployed may the owner delete the marker files in `/home/u339364475/nltag-data/ops/` (File Manager); they are harmless records.
