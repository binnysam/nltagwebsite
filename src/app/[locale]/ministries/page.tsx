import type { Metadata } from "next";
import { Container, Section } from "@/design-system/primitives";
import type { Locale } from "@/content/ui-strings";
import { loadMinistries } from "@/server/cms/public-site";
import { PublicShell } from "../_components/PublicShell";
import { MinistryEntries, PageHead } from "../_components/sections";
import { pageMetadata, routeLabel } from "../_components/site";

type Props = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata(locale, "ministries");
}

/** Ministries: published records; a contact line appears only after a Church Admin approved it. */
export default async function MinistriesPage({ params }: Props) {
  const { locale } = await params;
  const items = await loadMinistries(locale);
  return (
    <PublicShell locale={locale} route="ministries">
      <PageHead title={routeLabel(locale, "ministries")} />
      <Container>
        <Section aria-label={routeLabel(locale, "ministries")}>
          <MinistryEntries items={items} locale={locale} full />
        </Section>
      </Container>
    </PublicShell>
  );
}
