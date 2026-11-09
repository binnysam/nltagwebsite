import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ButtonLink } from "@/design-system/components";
import { Container, Section, Text } from "@/design-system/primitives";
import { t, type Locale } from "@/content/ui-strings";
import { loadTestimony } from "@/server/cms/public-site";
import { PublicShell } from "../../_components/PublicShell";
import { ShareButton } from "../../_components/ShareButton.client";
import { PageBody, PageHead } from "../../_components/sections";
import { detailHref, href, itemKey, pageMetadata, routeLabel } from "../../_components/site";
import styles from "../../public.module.css";

/** Testimony keys are content ids. */
export const dynamicParams = true;

type Props = { params: Promise<{ locale: Locale; key: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, key } = await params;
  const x = await loadTestimony(locale, key);
  if (!x) return { robots: { index: false, follow: false } };
  return pageMetadata(locale, "testimonies", { title: x.title, path: `/testimonies/${itemKey(x)}` });
}

/**
 * One testimony. Only published testimonies whose author's permission is recorded as Granted exist
 * here (public.ts); a withdrawn permission removes the page at once. Anonymous authors show
 * "Name withheld". The description meta is left empty on purpose (no personal text in previews).
 */
export default async function TestimonyPage({ params }: Props) {
  const { locale, key } = await params;
  const x = await loadTestimony(locale, key);
  if (!x) notFound();
  return (
    <PublicShell locale={locale} route="testimonies" currentPath={href(locale, "testimonies")}>
      <PageHead title={x.title} />
      <Container>
        <Section aria-label={x.title} className={styles.detail}>
          <Text variant="small" tone="secondary" data-testimony-author="">{x.author ?? t("testimony.anonymous", locale)}</Text>
          <PageBody item={x} />
          <div className={styles.actions}>
            <ShareButton path={detailHref(locale, "testimonies", x)} title={x.title} label={t("verse.share", locale)} copiedLabel={t("share.copied", locale)} />
            <ButtonLink href={href(locale, "testimonies")} variant="secondary">{routeLabel(locale, "testimonies")}</ButtonLink>
          </div>
        </Section>
      </Container>
    </PublicShell>
  );
}
