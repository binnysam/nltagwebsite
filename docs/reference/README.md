# Reference documents

| Document | Where |
|---|---|
| Phase 1 visual foundations (approved 1 Nov 2026) | `docs/reference/NLTAG-PHASE-1-VISUAL-FOUNDATIONS.md` |
| Approved tokens | `src/design-system/tokens/tokens.css` (identical to `tokens.final.css`) |
| Gate 0 decisions | claude.ai project NLTAGWebsite → `claude/NLTAG-GATE-0-DECISIONS.md` |
| Master prompt, `LLM-DESIGN-SYSTEMS.md`, `warm-editorial-bento-ui-skill.md` | claude.ai project NLTAGWebsite. Place copies at the repository root when the repo is set up (the master prompt expects them there). |

## Gate decisions that most affect code
- Tamil default (`/ta`), English secondary; light mode only.
- Friday-led schedule (see `src/content/schedule.ts`); NECK exactly; no address; Cottage Meeting hosts private.
- Bible: BSI Tamil (edition to confirm) and NKJV; placeholders until permission.
- Zero added recurring cost; Hostinger storage and MySQL recommended (Phase 4 approval).
- Typography Option A; Editorial A primary, Split C alternative; five static presets; 44px targets; motion as tested.
