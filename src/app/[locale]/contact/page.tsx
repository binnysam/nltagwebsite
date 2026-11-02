import type { Metadata } from "next";
import { Container, Section } from "@/design-system/primitives";
import { t, type Locale } from "@/content/ui-strings";
import { loadPage, RESERVED_PAGE_SLUGS } from "@/server/cms/public-site";
import { PublicShell } from "../_components/PublicShell";
import { Empty, PageBody, PageHead, PublicSection, VisitFacts } from "../_components/sections";
import { pageMetadata, routeLabel } from "../_components/site";

type Props = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const page = await loadPage(RESERVED_PAGE_SLUGS.contact, locale);
  return pageMetadata(locale, "contact", { title: page?.seoTitle || page?.title || undefined, description: page?.seoDescription || page?.summary });
}

/**
 * Contact and visit: Gate 0 facts only (NECK, Friday main worship; never an address), then the
 * church's own published CMS page "contact" (phone, email or directions exactly as they publish).
 */
export default async function ContactPage({ params }: Props) {
  const { locale } = await params;
  const page = await loadPage(RESERVED_PAGE_SLUGS.contact, locale);
  return (
    <PublicShell locale={locale} route="contact">
      <PageHead title={page?.title || routeLabel(locale, "contact")} lead={page?.summary} />
      <PublicSection id="visit" title={t("section.visit", locale)}>
        <VisitFacts locale={locale} />
      </PublicSection>
      <Container>
        <Section aria-label={routeLabel(locale, "contact")}>
          {page?.bodyMd ? <PageBody item={page} /> : page ? null : <Empty locale={locale} />}
        </Section>
      </Container>
    </PublicShell>
  );
}
