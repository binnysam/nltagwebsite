import type { Metadata } from "next";
import { SiteHeader } from "@/design-system/components";
import { Container, Section, Text, VisuallyHidden } from "@/design-system/primitives";
import { t, type Locale } from "@/content/ui-strings";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Holding page. The homepage is built in Phase 5; until then this route shows only the
 * header and a short notice, with no church content.
 */
export default async function Home({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  return (
    <>
      <SiteHeader locale={locale} />
      <main id="main">
        <Container>
          <Section>
            <VisuallyHidden as="h1">NLTAG</VisuallyHidden>
            <Text tone="secondary">{t("site.inPreparation", locale)}</Text>
          </Section>
        </Container>
      </main>
    </>
  );
}
