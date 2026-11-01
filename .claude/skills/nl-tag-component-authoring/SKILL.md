---
name: nl-tag-component-authoring
description: Use when creating or changing a reusable NLTAG component or variant: reuse check, anatomy, API, states, tokens, tests, docs and gallery.
---

# NLTAG component authoring

## Purpose
Every reusable piece of UI is a documented, tested component built from tokens.

## Use when
A request needs UI that existing components do not provide, or an existing component needs a new variant or state.

## Workflow
1. **Reuse first.** Check `src/design-system/components` and `primitives`. Prefer composition or a prop over a new component.
2. **Spec first.** Write/extend the spec in `docs/design-system/components/` using the template: metadata, when to use, anatomy, tokens, API, states, keyboard and accessibility, responsive, example, tests, related. Get approval for new visual decisions.
3. **Build.** Folder `src/design-system/components/<Name>/` with `<Name>.tsx`, `<name>.module.css`, `index.ts`; export from `components/index.ts`.
   - Semantic HTML first; ARIA only to fill gaps.
   - Server Component unless it needs state/effects; isolate client parts in `<Name>.client.tsx`.
   - Tamil rules via `:lang(ta)` in CSS, never by locale props on styling.
   - 44px minimum targets; visible label = accessible name.
   - States: default, hover, focus-visible, pressed, disabled, loading, error, selected — only those that apply.
4. **Gallery.** Add every variant and state to `src/app/[locale]/design-system/page.tsx` with `data-testid` where tests need it. Gallery copy uses bracketed placeholders, never invented church content.
5. **Tests.** Unit (behaviour, names, axe) in `tests/unit/components.test.tsx`; browser checks of computed styles against spec values in `tests/e2e/design-system.spec.ts`; add a visual baseline only for stable, high-value views.
6. **Validate** with the checklist.

## Checklist
- [ ] Spec written and matches the implementation
- [ ] Token audit passes
- [ ] Unit + axe tests pass
- [ ] Browser tests pass at 390 and 1280
- [ ] Gallery updated (both locales render)

## Escalate
New colours, type sizes, radii or motion; any deviation from the Phase 1 spec (record it in the spec under "Deviation note").
