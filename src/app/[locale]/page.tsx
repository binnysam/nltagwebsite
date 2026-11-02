import type { Metadata } from "next";
import { ButtonLink, Hero, ScheduleList, SectionIntro, SiteHeader } from "@/design-system/components";
import { Container, Heading, Section, Text } from "@/design-system/primitives";
import { t, type Locale } from "@/content/ui-strings";
import { churchName } from "@/content/church";
import { schedule } from "@/content/schedule";
import { otherLocale } from "@/lib/i18n";
import styles from "./home.module.css";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Homepage (pre-launch). Phase 3 adds the animated hero; the rest of the homepage is built in
 * Phase 5. Only approved content appears: the church name, approved interface strings and the
 * Gate 0 schedule. Welcome copy is CONTENT REQUIRED; until the church supplies it the hero
 * lead is the approved "website is being prepared" notice.
 */
export default async function Home({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const other = otherLocale(locale);
  const L = (k: Parameters<typeof t>[0]) => t(k, locale);
  return (
    <>
      <SiteHeader locale={locale} cta={{ href: "#schedule", label: L("cta.joinFriday") }} />
      <main id="main">
        <Container wide className={styles.heroWrap}>
          <Hero headingId="hero-title" pauseLabel={L("hero.pause")} playLabel={L("hero.play")}>
            <div className={styles.heroInner}>
              <span className={styles.altName} lang={other}>{churchName[other]}</span>
              <Heading level={1} styleAs="display-xl" tone="on-gradient" id="hero-title">
                {churchName[locale]}
              </Heading>
              {/* CONTENT REQUIRED: welcome lead. Approved pre-launch notice until then. */}
              <Text variant="body-l" tone="on-gradient" measure>
                {L("site.inPreparation")}
              </Text>
              <div className={styles.actions}>
                <ButtonLink href="#schedule">{L("cta.joinFriday")}</ButtonLink>
              </div>
            </div>
          </Hero>
        </Container>
        <Container>
          <Section id="schedule" aria-labelledby="schedule-title">
            <SectionIntro headingId="schedule-title" title={L("schedule.heading")} />
            <ScheduleList items={schedule} locale={locale} />
            <Text variant="small" tone="secondary" className={styles.note}>
              {L("schedule.timezone")}
            </Text>
          </Section>
        </Container>
      </main>
    </>
  );
}
