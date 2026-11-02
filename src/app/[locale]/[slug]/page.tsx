import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container, Section } from "@/design-system/primitives";
import type { Locale } from "@/content/ui-strings";
import { loadPage } from "@/server/cms/public-site";
import { PublicShell } from "../_components/PublicShell";
import { PageBody, PageHead } from "../_components/sections";
import { pageMetadata } from "../_components/site";

/** The [locale] layout fixes its own params; CMS slugs are open-ended. */
export const dynamicParams = true;

type Props = { params: Promise<{ locale: Locale; slug: string }> };

/** Same rule as the CMS slug validation: lowercase letters, digits and hyphens. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

async function load(locale: Locale, slug: string) {
  if (!SLUG.test(slug) || slug.length > 120) return null;
  return loadPage(slug, locale);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const page = await load(locale, slug);
  if (!page) return { robots: { index: false, follow: false } };
  return pageMetadata(locale, "home", { title: page.seoTitle || page.title, description: page.seoDescription || page.summary, path: `/${slug}` });
}

/**
 * Any other published CMS page, at /{locale}/{slug} (admin guide: "about-us" → /ta/about-us).
 * Fixed routes (about, contact, sermons, …) take precedence. Unpublished, unlisted-without-link
 * or missing pages are 404. A page shows only in the languages it has a title in.
 */
export default async function CmsPage({ params }: Props) {
  const { locale, slug } = await params;
  const page = await load(locale, slug);
  if (!page) notFound();
  return (
    <PublicShell locale={locale} route="home">
      <PageHead title={page.title} lead={page.summary} />
      <Container>
        <Section aria-label={page.title}>
          <PageBody item={page} />
        </Section>
      </Container>
    </PublicShell>
  );
}
