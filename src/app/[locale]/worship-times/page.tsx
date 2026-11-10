import type { Metadata } from "next";
import { ScheduleList } from "@/design-system/components";
import { Text } from "@/design-system/primitives";
import { t, type Locale } from "@/content/ui-strings";
import { schedule } from "@/content/schedule";
import { loadAnnouncements, loadMeetingsNow } from "@/server/cms/public-site";
import { PublicShell } from "../_components/PublicShell";
import { AnnouncementEntries, MeetingCards, PageHead, PublicSection } from "../_components/sections";
import { pageMetadata, routeLabel } from "../_components/site";
import styles from "../public.module.css";
import { listDescription } from "@/content/seo";

type Props = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata(locale, "worshipTimes", { description: listDescription(locale, "worshipTimes") });
}

/** Worship times: the Gate 0 weekly schedule, upcoming special meetings and announcements. */
export default async function WorshipTimesPage({ params }: Props) {
  const { locale } = await params;
  const [meetings, announcements] = await Promise.all([loadMeetingsNow(), loadAnnouncements(locale)]);
  return (
    <PublicShell locale={locale} route="worshipTimes" cta={{ href: "#schedule", label: t("cta.joinFriday", locale) }}>
      <PageHead title={routeLabel(locale, "worshipTimes")} />
      <PublicSection id="schedule" title={t("schedule.heading", locale)}>
        <ScheduleList items={schedule} locale={locale} />
        <Text variant="small" tone="secondary" className={styles.note}>{t("schedule.timezone", locale)}</Text>
      </PublicSection>
      <PublicSection id="special-meetings" title={t("section.specialMeetings", locale)}>
        <MeetingCards items={meetings} locale={locale} />
      </PublicSection>
      {announcements.length ? (
        <PublicSection id="announcements" title={t("section.announcements", locale)}>
          <AnnouncementEntries items={announcements} locale={locale} full />
        </PublicSection>
      ) : null}
    </PublicShell>
  );
}
