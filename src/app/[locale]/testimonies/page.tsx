import type { Metadata } from "next";
import { Container, Section } from "@/design-system/primitives";
import { ButtonLink } from "@/design-system/components";
import { t, type Locale } from "@/content/ui-strings";
import { formAvailable } from "@/server/forms/service";
import styles from "../public.module.css";
import { loadTestimonies } from "@/server/cms/public-site";
import { PublicShell } from "../_components/PublicShell";
import { TestimonyEntries, PageHead } from "../_components/sections";
import { href, pageMetadata, routeLabel } from "../_components/site";
import { listDescription } from "@/content/seo";

type Props = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata(locale, "testimonies", { description: listDescription(locale, "testimonies") });
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
          {formAvailable("testimony") ? (
            <div className={styles.action}>
              <ButtonLink href={`${href(locale, "testimonies")}/share`} variant="secondary">{t("testimonyForm.title", locale)}</ButtonLink>
            </div>
          ) : null}
        </Section>
      </Container>
    </PublicShell>
  );
}
