import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteHeader } from "@/design-system/components";
import { Container, Section } from "@/design-system/primitives";
import type { Locale } from "@/content/ui-strings";

/** Account pages are never indexed or cached (architecture §4). Headers are also set in next.config.ts. */
export const metadata: Metadata = { robots: { index: false, follow: false, nocache: true } };

/**
 * Same site header as the homepage (wordmark home link, skip link, language switch), so people
 * can get back to the site and change language from any account page. No CTA here.
 */
export default async function AccountLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <>
      <SiteHeader locale={locale as Locale} />
      <main id="main">
        <Container>
          <Section>{children}</Section>
        </Container>
      </main>
    </>
  );
}
