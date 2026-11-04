# NLTAG PR #12 — Post-review fixes (M1, M2)

4 Nov 2026 (Kuwait). Branch `security/r4-v6.1-mailbox-first`, PR #12 only. Not merged, not deployed. No migration, Hostinger env, production DB, `CLIENT_IP_SOURCE` or Church Admin change. No test weakened or deleted.

## Result
- New head **`84c9a32`** (one commit on top of `dc19f1f`). PR open, `mergeable_state: clean`.
- CI run 41731111693 on `84c9a32`: **verify ✅ · admin-browser ✅ · public-browser ✅**. MariaDB `11.8.9-MariaDB-ubu2404` confirmed by the version step.

## Changed files
- `src/app/[locale]/(account)/AuthForm.tsx` — one line: password sign-in no longer passes `callbackURL: /${locale}/verify-email`. The form already routes to `/${locale}/two-factor` or `/${locale}/account`.

## M2 — sign-in redirect: fixed
- Cause confirmed: Better Auth's client followed the callback after a successful sign-in, so users landed on the obsolete "email verified" page.
- Mailbox-first sign-up, `disableSignUp`, the auth gate, verification and two-factor are unchanged.
- Causal check: with the change reverted, the mailbox-first test fails 2/2; with it, passes 2/2.
- Tamil and English sign-in both land correctly (two-factor suite covers `ta` and `en`).

## M1 — MariaDB 11.8.9 deadlock: did not reproduce; no code change
- **CI log (attempt 1, `dc19f1f`)**: one request failed — `DELETE FROM verification WHERE expires_at < ?` → `ER_LOCK_DEADLOCK` (errno 1213), logged twice (Better Auth logger + Next server error, same params). Desktop sign-in timed out on the TOTP step; phone succeeded in the same moment.
- **Better Auth 1.7.15** `findVerificationValue` runs a range delete of expired rows on every lookup unless `verification.disableCleanup` is set. Two-factor verify calls `findVerificationValue` (range delete, via `verification_expires_idx`) and then `consumeVerificationValue` (transaction deleting by identifier). Two concurrent verifies can take index locks in opposite orders → deadlock.
- **Why it showed up**: test setup — 2 Playwright workers sign in the same seeded Church Admin, and `freshStep()` aligns both TOTP submissions to the start of the same 30 s step. Underlying race is library behaviour, not introduced by this PR (the PR adds no writer to `verification` on this path).
- **Frequency**: deadlock string in 1 of the last 25 admin-browser runs (only this one).
- **Rerun** of the failed job on unchanged `dc19f1f` (attempt 2): no deadlock; admin sign-ins passed. A different test failed once: axe `document-title` on the Content Editor page (desktop). Same intermittent failure seen once before on the Phase 6b branch (2 Nov, two-factor spec); the PR does not touch admin pages, layout or titles. Pre-existing flake.
- Per instructions, **no cleanup disable, purge or retry added**.

### Options for owner decision (not implemented)
1. **Test-only (lowest risk)**: stop the two browser projects submitting a TOTP for the same admin in the same instant (e.g. stagger the desktop project or run admin with one worker). Removes the CI flake; no app change.
2. **Retry once on `ER_LOCK_DEADLOCK`** around the verification cleanup/consume path — small app change, keeps Better Auth cleanup.
3. **`verification: { disableCleanup: true }` + bounded periodic purge** of expired rows (as done for `rate_limit_bucket`) — removes the race at the source; needs owner approval.
Production impact if left as is: a rare 500 when two verifications coincide; user retries; not a security bypass. Recommendation: option 1 now; option 2 or 3 before activation if desired.

## Test evidence
| Suite | CI 11.8.9 (`84c9a32`) | Local 10.11.14 |
|---|---|---|
| `npm run verify` (unit) | 248/248 | pass, 248/248 |
| Integration (default) | 209/209 | 209/209 |
| Integration (production) | 6/6 | 6/6 |
| Admin browser | 11 passed, 1 skipped | 11 passed |
| Two-factor browser | 8/8 | 8/8 |
| Public browser | 97 passed, 5 skipped | — |
| Mailbox-first sign-up (`auth.spec.ts`) | not in CI | 12/12 (`next dev`, outbox) |

Local DB is MariaDB 10.11.14 (container registries blocked from the sandbox); 11.8.9 evidence is GitHub CI.

## Unresolved
- `auth.spec.ts` still has no CI job, and its documented recipe cannot work with `next start` (accounts require SMTP; outbox only without SMTP). Proposal: a dev-mode browser job in CI — needs owner approval (workflow change).
- M1 race remains latent (options above). `document-title` axe flake remains intermittent.
- Review §9.3 (owner check of hPanel variables before merge) and §10 deferred items unchanged.
- Test comments in `admin.spec.ts`/`two-factor.spec.ts` still say sign-in "may land on verify-email" — now outdated but harmless; can tighten later.
