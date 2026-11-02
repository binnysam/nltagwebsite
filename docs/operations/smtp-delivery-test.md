# SMTP Stage A — one-time delivery test (TEMPORARY)

Owner request, 2 Nov 2026. Sends **one** copy of the existing bilingual `verify` email through the production Gmail SMTP configuration to a church-controlled address, while the accounts gate stays closed (`NLTAG_ACCOUNTS_ENABLED=0`). Covers tests A1–A4 of the SMTP readiness report. **Remove this mechanism in a separate reviewed PR after the test succeeds** (see "Removal").

## How it works
- `scripts/hostinger-build.mjs` runs it **after** a successful `next build`, and only when `NLTAG_APPROVED_SMTP_TEST=1` is set for that build. Normal builds print `No SMTP delivery test requested` and do nothing.
- Rules: `src/server/email/smtp-delivery-test.ts`. Runner: `scripts/email/smtp-delivery-test.ts` (`npm run email:smtp-test`). Tests: `tests/unit/smtp-delivery-test.test.ts`.
- Uses the existing transport (`src/server/email/transport.ts`, TLS 1.2+) and template (`renderEmail("verify", …)`): Tamil block first, English second, plain HTML, no images or tracking. The sender is `SMTP_FROM`, added by the transport.
- The link is `https://nltagkuwait.com/ta` (Tamil homepage). **No token, no account, no database access.** The wording is the real verification email, so it mentions verifying an address and 24 hours; for this test that is expected.

## Safety rules (each refuses and sends nothing)
| Rule | Why |
|---|---|
| `NLTAG_APPROVED_SMTP_TEST` must be exactly `1` | Off by default; explicit owner approval per build |
| Production only, and `NLTAG_ACCOUNTS_ENABLED` must **not** be `1` | Stage A is gate-closed only |
| Not in the same build as `NLTAG_APPROVED_PRODUCTION_MIGRATION=1` | One change per build (the build script refuses before doing anything) |
| All four `SMTP_*` set, `SMTP_USER` = `newlifetamilassembly@gmail.com`, `SMTP_FROM` = `New Life Tamil AG Church <newlifetamilassembly@gmail.com>` | Correct sender, and Gmail does not rewrite it |
| `BETTER_AUTH_URL` exactly `https://nltagkuwait.com` | Checks the masked value every email link is built from |
| `NLTAG_SMTP_TEST_TO` = the church mailbox or `newlifetamilassembly+<tag>@gmail.com` | Only church-controlled; one address; no header injection |
| `NLTAG_SMTP_TEST_RUN_ID` (3–40 chars, `a-z 0-9 -`) | Names this approval |
| The transport in use must be SMTP | Never the development outbox |
| Marker `/home/u339364475/nltag-data/ops/smtp-test-<run id>.json` (folder `700`, file `600`) is created **exclusively before** sending | Any later build with the same run id sends nothing — sent, failed or interrupted. A retry needs a new run id (a new approval). If the marker cannot be written, nothing is sent |

The build log shows one line starting `[nltag-smtp-test]`. It never contains the address (only `church mailbox (+tag)`), SMTP settings, passwords or server responses — on failure only a short code such as `EAUTH:535` or `ETIMEDOUT`. The marker holds the run id, status, time and that code; no address.

A refusal or a failed send **fails the build**: Hostinger keeps the previous release live. "Already happened" does not fail the build.

## Owner steps
Before starting: this PR is merged and deployed, SMTP variables are set (readiness report §3–4), `NLTAG_ACCOUNTS_ENABLED=0`.

1. hPanel → Websites → **nltagkuwait.com** → Node.js / Web App → **Environment variables**. Use **hPanel's editor** (the API replaces the whole set and would erase the masked secrets).
2. Check without changing: `NLTAG_ACCOUNTS_ENABLED` is `0`; `BETTER_AUTH_URL` is `https://nltagkuwait.com`; `NLTAG_APPROVED_PRODUCTION_MIGRATION` is **not** present.
3. **Add** three variables:

   | Name | Value |
   |---|---|
   | `NLTAG_APPROVED_SMTP_TEST` | `1` |
   | `NLTAG_SMTP_TEST_TO` | `newlifetamilassembly+webtest@gmail.com` (or another `+tag`) |
   | `NLTAG_SMTP_TEST_RUN_ID` | `stage-a-1` |
4. **Apply changes / Save and redeploy.** Hostinger rebuilds. (If saving does not start a build, use **Redeploy** on the latest deployment.)
5. Wait for the build to finish. Open the build log and find the `[nltag-smtp-test]` line:
   - `accepted by SMTP for the church mailbox (+webtest)` → go to step 6.
   - `REFUSED, nothing sent: …` → the reason names the variable to fix. Fix it, keep the same run id, rebuild.
   - `FAILED (CODE)` → nothing delivered. `EAUTH:535` = App Password wrong/revoked; `ETIMEDOUT`/`ESOCKET` = port blocked (try `SMTP_PORT=587`). Fix it, set a **new** run id (`stage-a-2`), rebuild.
6. **Immediately remove** the three `NLTAG_*SMTP_TEST*` variables in hPanel and apply. (Even if forgotten, the marker stops a second send for the same run id.)
7. In the church Gmail inbox check (readiness report A2–A4):
   - In **Inbox**, not Spam, within a minute; From **New Life Tamil AG Church** `<newlifetamilassembly@gmail.com>`; subject Tamil · English.
   - Tamil block first, English second; Tamil renders correctly in Gmail web **and** the phone app.
   - The link reads `https://nltagkuwait.com/ta` and opens the Tamil homepage.
   - ⋮ → **Show original**: `SPF: PASS`, `DKIM: PASS`, `DMARC: PASS`.
8. Public site still normal: `/ta` and `/en` load; `/ta/sign-up`, `/ta/sign-in`, `/ta/admin`, `/api/auth/get-session` still 404.
9. Tell Claude the result (pass/fail per item). Do not paste the email source, headers with addresses, or any password.

## Removal (separate reviewed PR, after the test passes)
Delete `src/server/email/smtp-delivery-test.ts`, `scripts/email/smtp-delivery-test.ts`, `tests/unit/smtp-delivery-test.test.ts`, this document, the `email:smtp-test` script in `package.json`, and the SMTP-test block and combined-build refusal in `scripts/hostinger-build.mjs`; remove the references in `docs/operations/hostinger-deployment.md`, `docs/backend/data-and-auth.md` and `CLAUDE.md`. Confirm the three variables are gone from hPanel. The marker file in `/home/u339364475/nltag-data/ops/` is a harmless record; the owner may delete it in File Manager.
