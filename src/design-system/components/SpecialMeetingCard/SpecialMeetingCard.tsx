import Link from "next/link";
import { cx } from "@/lib/cx";
import { GradientSurface, type GradientPreset } from "../GradientSurface";
import styles from "./special-meeting-card.module.css";

export interface SpecialMeetingCardProps {
  preset: GradientPreset;
  /** Type pill text, e.g. "சிறப்புக் கூட்டம்". */
  typeLabel: string;
  /** Formatted Asia/Kuwait date and time. */
  dateLabel: string;
  /** ISO date-time for <time dateTime>. */
  dateTime: string;
  /** Tamil and English titles. Either may be empty when the church published one language only. */
  titleTa: string;
  titleEn: string;
  /** Which title is the heading (the page language); the other sits beneath. Defaults to Tamil. */
  primary?: "ta" | "en";
  /** Public venue line (NECK, members' homes or a named place). Never a private address. */
  location?: string;
  announcement?: string;
  /** When set, the whole card links to the detail page. */
  href?: string;
  headingLevel?: 2 | 3;
}

/**
 * CMS-driven special meeting card. Never filled with sample content on a public page;
 * all text comes from an approved CMS record (Phase 4/5).
 */
export function SpecialMeetingCard({
  preset, typeLabel, dateLabel, dateTime, titleTa, titleEn, primary = "ta", location, announcement, href, headingLevel = 3,
}: SpecialMeetingCardProps) {
  const H = `h${headingLevel}` as "h2" | "h3";
  const byLang = { ta: titleTa, en: titleEn };
  const secondary = primary === "ta" ? "en" : "ta";
  // Fall back to the other language when the page language has no title.
  const mainLang = byLang[primary] ? primary : secondary;
  const altLang = mainLang === "ta" ? "en" : "ta";
  const title = <span lang={mainLang}>{byLang[mainLang]}</span>;
  return (
    <article className={cx(styles.card, href && styles.interactive)}>
      <GradientSurface preset={preset} className={styles.art}>
        <span className={styles.pill} lang={primary}>{typeLabel}</span>
      </GradientSurface>
      <div className={styles.body}>
        <time className={styles.date} dateTime={dateTime}>{dateLabel}</time>
        <H className={styles.titleTa} lang={mainLang}>
          {href ? <Link href={href} className={styles.link}>{title}</Link> : title}
        </H>
        {mainLang !== altLang && byLang[altLang] ? <p className={styles.titleEn} lang={altLang}>{byLang[altLang]}</p> : null}
        {location ? <p className={styles.location}>{location}</p> : null}
        {announcement ? <p className={styles.announcement}>{announcement}</p> : null}
      </div>
    </article>
  );
}
