import type { Metadata } from "next";
import { ButtonLink, Hero, ScheduleList } from "@/design-system/components";
import { Container, Heading, Text } from "@/design-system/primitives";
import { t, type Locale } from "@/content/ui-strings";
import { churchName } from "@/content/church";
import { schedule } from "@/content/schedule";
import { otherLocale } from "@/lib/i18n";
import { loadHomeContent } from "@/server/cms/public-site";
import { PublicShell } from "./_components/PublicShell";
import {
  AnnouncementEntries, Empty, MeetingCards, MinistryEntries, PageBody, PublicSection, SermonEntries, TestimonyEntries, ViewAll,
  VerseShowcase, VisitFacts,
} from "./_components/sections";
import { href, pageMetadata } from "./_components/site";
import styles from "./home.module.css";
import { listDescription } from "@/content/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata(locale, "home", { description: listDescription(locale, "home") });
}

/** How many records each homepage section shows before "View all". */
const HOME_LIMIT = 3;

/**
 * Homepage (Phase 5). Order approved in the Phase 5 brief: hero and welcome → church
 * introduction → worship schedule → special meetings and announcements → ministries → sermons
 * → testimonies → Bible verse → visit and contact → footer.
 *
 * Only approved content appears: the church name, approved interface strings, the Gate 0
 * schedule and published CMS records (src/server/cms/public.ts). The hero lead is the summary of
 * the published "welcome" page; until the church publishes one it is the approved
 * "website is being prepared" notice.
 */
export default async function Home({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const other = otherLocale(locale);
  const L = (k: Parameters<typeof t>[0]) => t(k, locale);
  const now = new Date();
  const c = await loadHomeContent(locale);

  return (
    <PublicShell locale={locale} route="home" cta={{ href: "#schedule", label: L("cta.joinFriday") }}>
      <Container wide className={styles.heroWrap}>
        <Hero headingId="hero-title" pauseLabel={L("hero.pause")} playLabel={L("hero.play")}>
          <div className={styles.heroInner}>
            <span className={styles.altName} lang={other}>{churchName[other]}</span>
            <Heading level={1} styleAs="display-xl" tone="on-gradient" id="hero-title">
              {churchName[locale]}
            </Heading>
            <Text variant="body-l" tone="on-gradient" measure data-hero-lead="">
              {c.welcome?.summary || L("site.inPreparation")}
            </Text>
            <div className={styles.actions}>
              <ButtonLink href="#schedule">{L("cta.joinFriday")}</ButtonLink>
            </div>
          </div>
        </Hero>
      </Container>

      <PublicSection
        id="about"
        title={c.about?.title || L("nav.about")}
        lead={c.about?.summary}
        action={c.about ? <ButtonLink href={href(locale, "about")} variant="secondary">{L("action.readMore")}</ButtonLink> : undefined}
      >
        {c.about ? null : <Empty locale={locale} />}
      </PublicSection>

      <PublicSection id="schedule" title={L("schedule.heading")}>
        <ScheduleList items={schedule} locale={locale} />
        <Text variant="small" tone="secondary" className={styles.note}>{L("schedule.timezone")}</Text>
      </PublicSection>

      <PublicSection id="special-meetings" title={L("section.specialMeetings")} action={c.meetings.length > HOME_LIMIT ? <ViewAll locale={locale} route="worshipTimes" /> : undefined}>
        <MeetingCards items={c.meetings} locale={locale} limit={HOME_LIMIT} />
      </PublicSection>

      {c.announcements.length ? (
        <PublicSection id="announcements" title={L("section.announcements")}>
          <AnnouncementEntries items={c.announcements.slice(0, HOME_LIMIT)} locale={locale} />
        </PublicSection>
      ) : null}

      <PublicSection id="ministries" title={L("nav.ministries")} action={c.ministries.length ? <ViewAll locale={locale} route="ministries" /> : undefined}>
        <MinistryEntries items={c.ministries} locale={locale} limit={HOME_LIMIT} />
      </PublicSection>

      <PublicSection id="sermons" title={L("nav.sermons")} action={c.sermons.length ? <ViewAll locale={locale} route="sermons" /> : undefined}>
        <SermonEntries items={c.sermons} locale={locale} limit={HOME_LIMIT} />
      </PublicSection>

      <PublicSection id="testimonies" title={L("nav.testimonies")} action={c.testimonies.length ? <ViewAll locale={locale} route="testimonies" /> : undefined}>
        <TestimonyEntries items={c.testimonies} locale={locale} limit={HOME_LIMIT} />
      </PublicSection>

      <PublicSection id="verse" title={L("verse.today")}>
        <VerseShowcase verse={c.verse} locale={locale} now={now} />
      </PublicSection>

      <PublicSection id="visit" title={L("section.visit")} action={<ButtonLink href={href(locale, "contact")} variant="secondary">{L("nav.contact")}</ButtonLink>}>
        <VisitFacts locale={locale} />
        {c.contact ? <PageBody item={c.contact} /> : null}
      </PublicSection>
    </PublicShell>
  );
}
