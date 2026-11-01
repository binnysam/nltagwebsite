# Governance

## Authority
Gate decisions → Phase 1 visual foundations → master prompt → `LLM-DESIGN-SYSTEMS.md` → `warm-editorial-bento-ui-skill.md`. Conflicts are reported to the owner, never resolved silently.

## Changing the system
| Change | Needs |
|---|---|
| Value in `tokens.css` | Owner approval, decision record, update the SHA-256 in `tests/unit/token-audit.test.ts` |
| New component token | Justification, entry in `token-reference.md`; `[ADDITION]` until approved |
| New component or variant | Spec in `docs/design-system/components/`, tests, gallery entry |
| New icon | Same drawing style, added to `Icon.tsx` and documented |
| Audit exception | `token-audit-ignore: <reason>` on the line; listed in the report |

Never edit the audit to make a failure pass.

## Definition of done for UI work
1. Relevant specs and skills read first.
2. Existing components and tokens reused.
3. `npm run verify` passes (token audit, lint, typecheck, unit tests, build).
4. `scripts/serve-gallery.sh && npm run test:e2e` passes; new visual baselines reviewed before they are committed.
5. Docs updated when behaviour or rules changed.
6. Report what changed, what was tested and what remains.

## Private gallery
`/[locale]/design-system` renders only when the build sets `NLTAG_DESIGN_SYSTEM_GALLERY=1`. Production builds never set it, so the route returns 404. It is `noindex`.
