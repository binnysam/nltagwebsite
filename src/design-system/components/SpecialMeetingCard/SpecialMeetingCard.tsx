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
  titleTa: string;
  titleEn: string;
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
  preset, typeLabel, dateLabel, dateTime, titleTa, titleEn, announcement, href, headingLevel = 3,
}: SpecialMeetingCardProps) {
  const H = `h${headingLevel}` as "h2" | "h3";
  const title = <span lang="ta">{titleTa}</span>;
  return (
    <article className={cx(styles.card, href && styles.interactive)}>
      <GradientSurface preset={preset} className={styles.art}>
        <span className={styles.pill} lang="ta">{typeLabel}</span>
      </GradientSurface>
      <div className={styles.body}>
        <time className={styles.date} dateTime={dateTime}>{dateLabel}</time>
        <H className={styles.titleTa}>
          {href ? <Link href={href} className={styles.link}>{title}</Link> : title}
        </H>
        <p className={styles.titleEn} lang="en">{titleEn}</p>
        {announcement ? <p className={styles.announcement}>{announcement}</p> : null}
      </div>
    </article>
  );
}
