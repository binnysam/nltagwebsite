# Safe migration plan — reviewed Phase 2 → canonical NLTAGWebsite repo

**Date:** 1 November 2026 · **Status:** proposal, awaiting owner approval · Nothing has been run on the owner's Mac.

## Goal and guarantees

Bring the reviewed Phase 2 project (commit `7e8a14c` plus the review pass) into the owner's local `NLTAGWebsite` Git repository and its GitHub repository.

- **Nothing is overwritten or deleted.** The existing `main`, all branches, all commits and the uncommitted `package.json` edits are preserved.
- **No force-push, ever.** `main` on GitHub changes only when the owner merges a pull request.
- **Two independent backups** exist before the first Git command that writes anything.
- **Every step is reversible** (rollback at the end).

## What we know, and what pre-flight must confirm

| Fact | Source | Confirm in pre-flight |
|---|---|---|
| Local folder `NLTAGWebsite/nltagwebsite` holds an older create-next-app scaffold | Phase 2 report §6.7 | Exact path; whether `.git` is in `nltagwebsite/` or `NLTAGWebsite/` |
| It has an uncommitted `package.json` pointing to Next canary / React RC | Phase 2 report §6.7 | `git status`, `git diff` |
| Reviewed project history is one commit (`7e8a14c`), unrelated to the local history | Reviewed repo | — |
| GitHub remote, default branch, protection rules, visibility | Unknown | `git remote -v`, GitHub settings |
| Whether the owner wrote any files in the scaffold (beyond create-next-app defaults) | Unknown | `git log --stat`, file list |

If pre-flight finds anything different (e.g. no remote, work the owner wants kept in `app/`), I stop and report before continuing.

## Step 0 — Freeze the reviewed project (in the cloud workspace)

1. Commit the review pass on top of `7e8a14c` as one commit: *"Phase 2 review: static loading indicator, Node 22 pin, Tamil review gate"*. Author: the owner's Git identity (name/email to be confirmed), with a Claude co-author line.
2. Create `nltag-phase2.bundle` (a Git bundle: a single file containing the full history) and run `git bundle verify`.
3. Deliver the bundle with its SHA-256 checksum.

## Step 1 — Back up (owner's Mac)

```bash
cd ~/<path>/NLTAGWebsite
ditto nltagwebsite ~/NLTAG-backups/nltagwebsite-2026-11-01          # full copy, incl. .git and uncommitted files
cd nltagwebsite
git bundle create ~/NLTAG-backups/nltagwebsite-pre-phase2.bundle --all
git diff > ~/NLTAG-backups/uncommitted-package-json.patch            # human-readable copy
```

## Step 2 — Preserve the uncommitted scaffold edits on their own branch

```bash
git switch -c archive/scaffold-canary-experiment
git add package.json package-lock.json   # only files shown as modified in pre-flight
git commit -m "Archive: uncommitted canary/RC experiment before Phase 2 integration"
git switch main                          # main is now exactly as it was
```

The canary/RC edits are kept in history, not discarded, and are not carried forward (Phase 2 pins Next 16.4.3 / React 19.3.1).

## Step 3 — Import Phase 2 as a separate branch

```bash
git bundle verify ~/Downloads/nltag-phase2.bundle
git fetch ~/Downloads/nltag-phase2.bundle main:import/phase2-reviewed
```

This only adds a branch. `main` and the working tree are untouched.

## Step 4 — Integrate on a feature branch

```bash
git switch -c integrate/phase2 main
git merge --no-ff --allow-unrelated-histories import/phase2-reviewed
```

- **Overlapping files** (expected: `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `.gitignore`, `README.md`, `next-env.d.ts`): take the Phase 2 version.
- **Leftover scaffold files** that Phase 2 replaces (expected: root `app/` or `src/app/page.tsx`, `globals.css`, default SVGs in `public/`): removed **in a commit on this branch only**, after I list them for the owner. Any file the owner wrote is kept and reported, never removed silently.
- Result: one merge commit whose history contains both the scaffold commits and the Phase 2 commits.

## Step 5 — Verify on the Mac

```bash
nvm install 22.23.4 && nvm use          # reads .nvmrc
rm -rf node_modules .next && npm ci
npm run verify                          # token audit, Tamil check, lint, typecheck, unit tests, build
scripts/serve-gallery.sh && npx playwright test --grep-invert "visual baselines"
```

Visual baselines are Linux snapshots (Phase 2 report §6.5), so on macOS they are skipped; I rerun the full suite including baselines in the cloud workspace against the same commit. Also check: `git status` clean, no `.env` tracked (`git ls-files | grep -i env` → only `.env.example`), `tokens.css` SHA-256 = `909a67ca…df58`.

## Step 6 — GitHub (pull request, not a push to main)

```bash
git push -u origin integrate/phase2
git push origin archive/scaffold-canary-experiment
```

Open a pull request `integrate/phase2 → main`. The owner reviews and merges (merge commit, not squash, so the Phase 2 history stays). Repository visibility, branch protection and settings are not changed. `import/phase2-reviewed` stays local.

## Rollback

| Situation | Action |
|---|---|
| Before the PR is merged | Delete the `integrate/phase2` branch; `main` was never touched |
| After merge | `git revert -m 1 <merge-commit>` and push via a PR (no history rewrite) |
| Anything unexpected | Restore from `~/NLTAG-backups/` (folder copy or bundle) |

## Decisions needed from the owner

1. **Approve this plan.**
2. **Git identity for the commit in Step 0** (name and email to use as author).
3. **Who runs Steps 1–6:** the owner (copy-paste commands), or Claude through the linked Mac — that needs access to the `NLTAGWebsite` folder (one permission prompt), and Claude stops before `git push` for a final confirmation.
4. **Merge strategy:** recommended `--allow-unrelated-histories` merge (keeps both histories). Alternative: start Phase 2 on a fresh branch with no shared history (simpler, but `main` then needs replacing via PR).
