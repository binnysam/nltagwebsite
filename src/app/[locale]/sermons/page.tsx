import type { Metadata } from "next";
import { Container, Section } from "@/design-system/primitives";
import type { Locale } from "@/content/ui-strings";
import { loadSermons } from "@/server/cms/public-site";
import { PublicShell } from "../_components/PublicShell";
import { SermonEntries, PageHead } from "../_components/sections";
import { pageMetadata, routeLabel } from "../_components/site";

type Props = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata(locale, "sermons");
}

/** Sermons: published sermon records, newest first. Video is linked to its own site, never re-hosted. */
export default async function SermonsPage({ params }: Props) {
  const { locale } = await params;
  const items = await loadSermons(locale);
  return (
    <PublicShell locale={locale} route="sermons">
      <PageHead title={routeLabel(locale, "sermons")} />
      <Container>
        <Section aria-label={routeLabel(locale, "sermons")}>
          <SermonEntries items={items} locale={locale} full />
        </Section>
      </Container>
    </PublicShell>
  );
}
