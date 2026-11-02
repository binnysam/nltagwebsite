import type { Metadata } from "next";
import { Container, Section } from "@/design-system/primitives";
import type { Locale } from "@/content/ui-strings";
import { loadPage, RESERVED_PAGE_SLUGS } from "@/server/cms/public-site";
import { PublicShell } from "../_components/PublicShell";
import { Empty, PageBody, PageHead } from "../_components/sections";
import { pageMetadata, routeLabel } from "../_components/site";

type Props = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const page = await loadPage(RESERVED_PAGE_SLUGS.about, locale);
  return pageMetadata(locale, "about", { title: page?.seoTitle || page?.title || undefined, description: page?.seoDescription || page?.summary });
}

/** About: the published CMS page with the slug "about". Nothing is written here by the website. */
export default async function AboutPage({ params }: Props) {
  const { locale } = await params;
  const page = await loadPage(RESERVED_PAGE_SLUGS.about, locale);
  return (
    <PublicShell locale={locale} route="about">
      <PageHead title={page?.title || routeLabel(locale, "about")} lead={page?.summary} />
      <Container>
        <Section aria-label={page?.title || routeLabel(locale, "about")}>
          {page?.bodyMd ? <PageBody item={page} /> : page ? null : <Empty locale={locale} />}
        </Section>
      </Container>
    </PublicShell>
  );
}
