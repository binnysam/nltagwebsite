"use client";

import { useParams } from "next/navigation";
import { Button, ButtonLink } from "@/design-system/components";
import { Container, Heading, Section, Text } from "@/design-system/primitives";
import { t, type Locale } from "@/content/ui-strings";
import styles from "./public.module.css";

/**
 * Branded error page (roadmap B3) for unexpected server errors under /{locale}, in the URL's
 * language, with "Try again" and a link home. Shows no error detail (the digest is logged on the
 * server only). Static: no motion.
 */
export default function LocaleError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const params = useParams<{ locale?: string }>();
  const locale: Locale = params?.locale === "en" ? "en" : "ta";
  return (
    <main id="main" lang={locale}>
      <Container className={styles.pageHead}>
        <Heading level={1} styleAs="display-l">{t("error.title", locale)}</Heading>
        <div className={styles.note}>
          <Text variant="body-l" tone="secondary" measure>{t("error.body", locale)}</Text>
        </div>
      </Container>
      <Container>
        <Section aria-label={t("error.title", locale)}>
          <div className={styles.actions} data-error-page="">
            <Button onClick={() => reset()}>{t("error.retry", locale)}</Button>
            <ButtonLink href={`/${locale}`} variant="secondary">{t("nav.home", locale)}</ButtonLink>
          </div>
        </Section>
      </Container>
    </main>
  );
}
