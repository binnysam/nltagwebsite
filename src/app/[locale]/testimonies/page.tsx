import type { Metadata } from "next";
import { Container, Section } from "@/design-system/primitives";
import type { Locale } from "@/content/ui-strings";
import { loadTestimonies } from "@/server/cms/public-site";
import { PublicShell } from "../_components/PublicShell";
import { TestimonyEntries, PageHead } from "../_components/sections";
import { pageMetadata, routeLabel } from "../_components/site";

type Props = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata(locale, "testimonies");
}

/** Testimonies: published only with recorded, granted permission; anonymous authors stay anonymous. */
export default async function TestimoniesPage({ params }: Props) {
  const { locale } = await params;
  const items = await loadTestimonies(locale);
  return (
    <PublicShell locale={locale} route="testimonies">
      <PageHead title={routeLabel(locale, "testimonies")} />
      <Container>
        <Section aria-label={routeLabel(locale, "testimonies")}>
          <TestimonyEntries items={items} locale={locale} full />
        </Section>
      </Container>
    </PublicShell>
  );
}
