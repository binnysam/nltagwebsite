# Migration plan v3 — execution checklist

**Date:** 1 November 2026 · **Status:** approach and checklist approved by the owner (1 Nov 2026). Steps 0–2 done; waiting at Gate 1.
**Source:** Phase 2 bundle (`7e8a14c` + review pass `d3c3992` + Tamil approval `6f8fea0` + this plan).
**Canonical repo:** `/Users/Binny/NLTAG/NLTAGWebsite/nltagwebsite` · **GitHub:** `binnysam/nltagwebsite` (public, empty)

## Owner conditions (1 Nov 2026)

1. Finalised Tamil is in the project and its approval records. **Done** (§A).
2. Full backup procedure is kept. **No change to the repo until the owner confirms an extra copy of the backups outside the Mac's internal disk** (Gate 1).
3. Preserve all files, Git history, uncommitted changes and untracked documents.
4. Separate archive branch and integration branch.
5. Delete nothing beyond the four listed scaffold files without showing the owner first.
6. Run the complete verification after integration.
7. No push, no visibility change, no PR merge, no Phase 3 without explicit approval.

## A. Tamil content (done, in the cloud copy only)

- 48 of 48 items `confirmed`: 22 owner-supplied (exact), 26 recommended drafts approved unchanged.
- Record: `docs/content/tamil-content-review.md` (generated) and `src/content/tamil-approvals.ts` (owner strings and previous drafts).
- Checks: `npm run verify` pass; 39/39 unit tests; 53 browser tests pass, 1 skipped by design. Five visual baselines were regenerated because their Tamil text changed; nothing else in them changed.

## B. Checklist

| # | Where | Step | Writes to the owner's folder | Gate |
|---|---|---|---|---|
| 0 | Cloud | Commit review pass and Tamil approval; create `nltag-phase2-reviewed.bundle`; `git bundle verify`; test clone + `git fsck` | No | — |
| 1 | Mac | Create backups in `NLTAGWebsite/_migration-backups-2026-11-01/`: A full folder `.tar.gz` (incl. `.git`, `node_modules`, `.next`, `.DS_Store`); B1 history bundle; B2 uncommitted-changes patch; B3 untracked-files `.tar.gz`; `SHA256SUMS.txt` | New backup folder only | — |
| 1v | Mac | Verify: archive file count = disk count; test-restore A to a temp folder inside the backup folder and byte-compare every file; `git bundle verify` B1, clone + `git fsck`; `git apply --check` B2 on `76dc53c`; byte-compare B3; `shasum -a 256 -c` | Temp folder inside backup folder | — |
| 2 | Mac | Copy the Phase 2 bundle to `_migration-backups-2026-11-01/incoming/` and verify its checksum | New file only | — |
| — | **STOP — Gate 1** | **Owner copies `_migration-backups-2026-11-01/` to an external drive or cloud storage and confirms.** Optional: connect that copy and I verify it against `SHA256SUMS.txt` | — | Owner |
| 3 | Repo | Commit the uncommitted `package.json` / `package-lock.json` edits to `archive/scaffold-canary-experiment`; return to `main` (restores those two files to their committed content — originals stay in the archive branch and backups A, B2) | Yes: the two files | After Gate 1 |
| 4 | Repo | `git fetch <bundle> main:import/phase2-reviewed` | New branch only | — |
| 5 | Cloud | Dry-run merge in a verification clone; compare with the expected conflicts (`package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `README.md`, `.gitignore` union) and removals (§C). **Any difference → stop and show the owner** | No | — |
| 6 | Repo | `integrate/phase2` from `main`; `merge --no-ff --allow-unrelated-histories`; resolve as above; remove only §C | Yes, as listed | — |
| 7 | Cloud | Complete verification on a fresh clone of `integrate/phase2`: `npm ci`; `npm run verify` (token audit, Tamil record check, lint, typecheck, unit tests, production build); Playwright at 390 and 1280; production smoke test; `tokens.css` SHA-256 = `909a67ca…f58`; secret scan; `npm audit --omit=dev`; `git fsck`; untracked files and archive branch still present and unchanged | No | — |
| 8 | Repo | `git remote add origin https://github.com/binnysam/nltagwebsite.git` (config only) | `.git/config` only | — |
| — | **STOP — Gate 2** | Report with verification results | — | Owner |
| 9 | GitHub | Only after explicit approval: push `main`, `integrate/phase2`, `archive/scaffold-canary-experiment`; open PR. No force-push. **Stop before merge** | — | Owner |

Not in scope without separate approval: merging the PR, changing repository visibility, adding the untracked documents to Git, Phase 3.

Pre-launch items (Tamil formatter phrases, date formatting and others) are tracked in `docs/reports/pre-launch-approval-checklist.md`. They do not block the migration.

## C. Deletions (complete list)

Removed on `integrate/phase2` only; they stay on `main`, in history and in backup A:
`app/favicon.ico`, `app/globals.css`, `app/layout.tsx`, `app/page.tsx`.

Anything else that would be removed → stop and show the owner first.

Git also creates and removes its own lock files under `.git/` during steps 3–8 and rewrites the two files in step 3. That needs the folder's delete permission (one prompt). It is used only for these Git operations.

## D. Preserved (checked in step 7)

- `main` at `76dc53c`, unchanged. All history.
- Uncommitted edits: on `archive/scaffold-canary-experiment`, in B2 and A.
- The 10 untracked documents stay on the Mac, untouched and untracked. Pushing Git branches publishes only committed files, so these documents are **not** published by step 9. They are not added to Git, moved, edited or deleted unless the owner explicitly approves adding them. Step 7 checks they are still present, untracked and byte-identical to backup B3:
  `LLM-DESIGN-SYSTEMS.md`, `NLTAG-CHURCH-CLAUDE-MASTER-PROMPT.md`, `warm-editorial-bento-ui-skill.md`, `docs/design-system/proposals/phase-1-visual-foundations.md`, `docs/design-system/proposals/specimen/index.html`, `docs/design-system/proposals/tokens.proposal.css`, `docs/product/gate-0-decisions.md`, `docs/research/bible-permissions.md`, `docs/research/infrastructure-zero-cost.md`, `docs/research/live-site-audit-2026-11-01.md`.
- `AGENTS.md`, `public/*.svg`, `node_modules/`, `.next/`, `next-env.d.ts`, `.DS_Store`.

## E. Git author

`binnysam <binnysamuelchristy@gmail.com>` for the review-pass, Tamil, archive and merge commits (review-pass and Tamil commits add `Co-Authored-By: Claude`). Phase 2 commit `7e8a14c` unchanged. Nothing is pushed, so the author can still be changed (for example to `Mersheena <mersheena2001@gmail.com>`) before step 9.

## F. Rollback

Before push: `git switch main`; delete `integrate/phase2`, `import/phase2-reviewed` and the archive branch if unwanted. Anything unexpected: restore backup A or B.
