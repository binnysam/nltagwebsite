# Live site security remediation checklist (old nltagkuwait.com app)

**Date:** 2 November 2026 · **Status:** proposal only — nothing has been changed · **Separate from:** Phase 4 (new website)

**Scope:** the application live on nltagkuwait.com today: Next.js 15.3.3, GitHub `Mersheena-1/nltagkuwait` (`main`, auto-deploy on), deployed 9 June 2026. It is not the new `binnysam/nltagwebsite` code.

**Rule for every step marked 🔒:** I show you the exact change (diff, commands, or hPanel clicks) first and act only after you approve that specific step. Nothing in this checklist has been done.

---

## 0. Correction to the Phase 4a report — read first

Phase 4a suggested **Option A: bump `next` to 15.3.6**. That is **not enough**. 15.3.6 only fixes the December 2025 remote-code-execution flaw (CVE-2025-66478). Since then:

- Follow-up React Server Components flaws (CVE-2025-55184 denial of service, CVE-2025-55183 source code exposure, and the completed fix CVE-2025-67779) need **at least 15.3.8**.
- `npm audit` today against **15.3.9** (the last 15.3 release) still reports **1 critical and 2 high** advisories, including unauthenticated remote code execution in the Image Optimization API, fixed only in the 15.5 line.
- **15.5.28** (latest 15.x) clears every `next` advisory except build-time PostCSS issues bundled inside it. **16.4.3** (what the new site uses) reports none.

So the realistic choices are:

| Option | What | Effort and risk | Recommendation |
|---|---|---|---|
| **B — holding page** | Replace the old app with a static "website being prepared" page until the new site launches | Smallest attack surface; forms stop collecting data; needs a small new repo or branch | **Recommended** |
| **A′ — upgrade to 15.5.28** | `next@15.5.28` + matching `react`/`react-dom` in `Mersheena-1/nltagkuwait` | 15.3 → 15.5 can break the build; old app keeps running its forms and secrets | Only if the old site must stay live |
| A — 15.3.6 | As in Phase 4a | Leaves known critical/high flaws | **Withdrawn** |

---

## 1. Immediate containment (hours, not days)

- [ ] 🔒 **1.1 Choose B or A′.** Reply with your choice.
- [ ] 🔒 **1.2 Pause auto-deploy?** Decide whether to switch off Git auto-deploy for nltagkuwait.com in hPanel while the fix is prepared, so an unreviewed push cannot go live. (I'll give the exact clicks.)
- [ ] **1.3 Take a backup before touching anything.** In hPanel → Websites → nltagkuwait.com → Files → Backups: download the newest **files** and **database** backups to church-controlled storage. You do this; I don't need the file.
- [ ] 🔒 **1.4 Access I need to prepare the exact diff:** `Mersheena-1/nltagkuwait` is private, so I could not read it. Either give read access to the repository, or paste `package.json`, `package-lock.json` and the list of files under `app/api/`. Nothing is pushed without approval.

## 2. Next.js security patch

**If B (holding page):**
- [ ] 🔒 2.1 I prepare a one-page static site (Tamil first, approved wording "இந்த இணையதளம் தயாராகி வருகிறது." / "This website is being prepared." — already owner-approved in `ui-strings`), no forms, no JavaScript, no server code. You review it.
- [ ] 🔒 2.2 Deploy it to nltagkuwait.com (replaces the old app; DNS and MX untouched). Keep the old repository and a backup so it can be restored.
- [ ] 2.3 Verify: home page loads over HTTPS; `/api/membership`, `/api/prayer`, `/api/contact` return 404; no `x-powered-by` header.

**If A′ (upgrade):**
- [ ] 🔒 2.1 On a branch: `next@15.5.28`, `react`/`react-dom` at the versions it requires, `eslint-config-next@15.5.28`; `npm ci && npm run build` locally; I show you the full `package.json` / lockfile diff.
- [ ] 🔒 2.2 Merge only after you approve; auto-deploy rebuilds.
- [ ] 2.3 Verify: Hostinger build log shows Next 15.5.28; the site loads; the three forms still submit; Hostinger's vulnerability scan no longer lists critical `next` issues.

## 3. Remaining dependency vulnerabilities (74 reported by Hostinger)

- [ ] 3.1 Run `npm audit --omit=dev` on the patched branch and list what remains (production dependencies only).
- [ ] 🔒 3.2 Upgrade or remove each critical/high one. Show the diff per package group.
- [ ] 3.3 Remove packages the old app no longer uses (smaller attack surface).
- [ ] 3.4 Record anything left (moderate, dev-only, no fix) with a one-line reason.
- (Skipped automatically if Option B removes the old app.)

## 4. Secret rotation

An RCE flaw was exposed on a public server for months, so assume every environment variable may have been read. **Rotate all five**, then remove what is no longer needed:

| Variable | Rotate where | Then |
|---|---|---|
| `DATABASE_URL` | Change the database user's password (Hostinger or the external DB provider) | Update the env var. If Option B, delete the variable. |
| `MONGODB_URI` | MongoDB Atlas (or wherever it lives): new password for the DB user; restrict network access to Hostinger's outbound IP if kept | As above |
| `RESEND_API_KEY` | Resend dashboard: revoke the old key, create a new one only if the old site keeps sending | Check Resend logs for sends you don't recognise |
| `ADMIN_JWT_SECRET` | New random value (`openssl rand -base64 48`) | Signs out every admin session issued with the old secret |
| `ADMIN_EMAIL` | Not a secret, but check that admin login for that address has a new strong password | — |

- [ ] 🔒 4.1 You (or the account owner) rotate at each provider; I never see the new values.
- [ ] 🔒 4.2 I give the exact hPanel environment-variable steps; you paste the new values; rebuild.
- [ ] 4.3 Check each provider's access logs for June 2026 → today for unknown IPs or unusual activity; note findings.
- [ ] 4.4 Also review: the GitHub account `Mersheena-1` (2-factor on, no unknown deploy keys or tokens), hPanel account (2-factor on), and the Hostinger file manager for files not in the repo (unexpected `.js`/`.php` in `public_html` or `nodejs/`).

## 5. Existing membership, prayer and contact data

The old app has live `/api/membership`, `/api/prayer` and `/api/contact` routes, so it may already hold personal data, possibly in an external database (MongoDB) outside Hostinger.

- [ ] 5.1 **Find out what exists.** The account owner logs into each database (MySQL via `DATABASE_URL`, MongoDB via `MONGODB_URI`) and notes, without exporting: which collections/tables exist, how many records, date range, and which fields (names, phones, dates of birth, prayer requests).
- [ ] 5.2 **Decide with church leadership:** keep (and where), migrate into the new site at Gate 4 (only with consent wording approved then), or delete. Prayer requests may contain sensitive personal information; deletion is the default unless the church has a reason to keep them.
- [ ] 🔒 5.3 If kept: export once to church-controlled encrypted storage (not email, not chat), then follow 5.4. I don't handle the export file.
- [ ] 🔒 5.4 Delete the data from the old databases after export, or after the decision to delete. Record date and who did it.
- [ ] 5.5 Stop collection: Option B removes the forms; with A′, consider disabling the three routes until Gate 4.
- [ ] 5.6 **Breach assessment:** if 4.3 shows unknown access to databases containing personal data, the church should consider informing affected people and check its obligations under Kuwait's data protection rules (CITRA Data Privacy Protection Regulation) with a qualified adviser. I can't give legal advice on this.

## 6. Old database and external services

- [ ] 6.1 List every external service the old app uses (from `package.json`, env vars and code): at least MongoDB, Resend, and whatever `DATABASE_URL` points to.
- [ ] 🔒 6.2 For each: after data is handled (§5), delete the database/project or downgrade to free and lock it. Cancel anything paid only with your approval.
- [ ] 6.3 Remove leftover Hostinger databases or users created for the old app (none were found on the account in Phase 4a; confirm the external one).
- [ ] 6.4 Make `Mersheena-1/nltagkuwait` archived (read-only) once the new site is live; keep it private.
- [ ] 6.5 Phase 7 note: Hostinger links one GitHub account per plan. Plan the switch to `binnysam/nltagwebsite` then.

## 7. Done when

- Live site is either the holding page or Next.js ≥ 15.5.28 with no critical/high production advisories.
- All five variables rotated or removed; provider logs checked.
- Personal data located, decided, and exported/deleted per the church's decision, with a dated record.
- External services closed or locked.
- Short closing note added to the project (what was done, dates, who).

## What I need from you now

1. **B or A′** (§0, recommended B).
2. Read access to `Mersheena-1/nltagkuwait`, or its `package.json` + lockfile + `app/api/` file list.
3. Whether to pause auto-deploy (1.2).
4. Who in the church can look into the MongoDB/MySQL data (5.1) and decide keep/delete (5.2).

## Sources

- [Next.js security update, 11 Dec 2025 (fixed versions per release line)](https://nextjs.org/blog/security-update-2025-12-11)
- [Vercel bulletin: CVE-2025-55184 and CVE-2025-55183](https://vercel.com/kb/bulletin/security-bulletin-cve-2025-55184-and-cve-2025-55183)
- [Hostinger: fixing the React Server Components vulnerability in Next.js](https://www.hostinger.com/support/?p=6957)
- `npm audit` results for next@15.3.9, 15.5.28 and 16.4.3 run on 2 Nov 2026 (npm advisory database)
