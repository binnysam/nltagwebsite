import type { Metadata } from "next";
import { ButtonLink } from "@/design-system/components";
import { Container, Section } from "@/design-system/primitives";
import { t, type Locale } from "@/content/ui-strings";
import { LocaleChoice } from "./_components/LocaleChoice.client";
import { PublicShell } from "./_components/PublicShell";
import { PageHead } from "./_components/sections";
import { href } from "./_components/site";
import styles from "./public.module.css";

export const metadata: Metadata = { robots: { index: false, follow: false } };

function NotFoundView({ locale }: { locale: Locale }) {
  return (
    <PublicShell locale={locale} route="home" currentPath="">
      {/* not-found.tsx gets no params, so the language-specific title is set here (React hoists it). */}
      <title>{`${t("notFound.title", locale)} · NLTAG`}</title>
      <PageHead title={t("notFound.title", locale)} lead={t("notFound.body", locale)} />
      <Container>
        <Section aria-label={t("notFound.title", locale)}>
          <div className={styles.actions} data-not-found="">
            <ButtonLink href={href(locale, "home")}>{t("nav.home", locale)}</ButtonLink>
            <ButtonLink href={href(locale, "worshipTimes")} variant="secondary">{t("nav.worshipTimes", locale)}</ButtonLink>
            <ButtonLink href={href(locale, "contact")} variant="secondary">{t("nav.contact", locale)}</ButtonLink>
          </div>
        </Section>
      </Container>
    </PublicShell>
  );
}

/**
 * Branded 404 for every public route under /{locale} (unknown CMS page, unknown sermon, …), in the
 * language of the URL, inside the normal header and footer. `noindex` like every page.
 */
export default function NotFound() {
  return <LocaleChoice ta={<NotFoundView locale="ta" />} en={<NotFoundView locale="en" />} />;
}
