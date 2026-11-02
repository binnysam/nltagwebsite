# Page composition patterns

## Page shell
```tsx
<SiteHeader locale={locale} navItems={…} cta={…} />
<main id="main">
  <Container>
    <Section aria-labelledby="x">
      <SectionIntro headingId="x" eyebrow="…" title="…" lead="…" action={<ButtonLink …/>} />
      {/* content */}
    </Section>
  </Container>
</main>
```

## Section rhythm
Sections are separated by padding only (64px phone, 96px from 1024px). Use a `Divider` only between list items or when two sections share a surface.

## Section micro-hero → content
Eyebrow, display-l heading, lead, one pill CTA, then the content. Left-aligned. At most one CTA per intro.

## Lists before grids
Schedules, events lists and forms are single-column editorial lists with line-10 dividers. Use a bento grid (12-column `Grid`, cards spanning different widths) only when items genuinely differ in weight, e.g. one featured sermon beside smaller ones.

## Gradients on a page
At most one gradient-led element per viewport outside the hero (a verse card or a meeting card row). Everything else stays on paper.

## Bilingual blocks
Page language first; the other language beneath in 14px ink-500 with its own `lang` (schedule names, special meeting titles). Never place Tamil and English at equal weight side by side except in the Split C verse card.

## Empty and fallback states
Use designed fallback copy from `ui-strings` (e.g. `verse.fallback`, `special.empty`). Never fill gaps with invented church content; missing content stays unpublished and is marked CONTENT REQUIRED in the CMS.

## Public pages (Phase 5)
Every public page uses `PublicShell` (`src/app/[locale]/_components/PublicShell.tsx`): SiteHeader (four links, one CTA) → `<main id="main">` → SiteFooter. Dedicated pages open with `PageHead` (one h1, display-l, optional lead) and then the content without a second heading. Homepage sections use `PublicSection` (SectionIntro + content); "View all" is a secondary pill in the intro's action slot. Section renderers in `_components/sections.tsx` are shared by the homepage and the dedicated pages, so a record looks the same everywhere.

Empty CMS sections show one quiet line between hairlines (`section.comingSoon`, or `special.empty` for meetings) — never sample content. Gradients outside the hero: the special-meeting card row and the verse card only, in separate sections.
