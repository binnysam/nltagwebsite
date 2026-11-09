import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import styles from "./entry-list.module.css";

export interface Entry {
  /** Stable key (CMS id). */
  id: string;
  /** Short line above the title: date, speaker, reference. Already formatted. */
  meta?: ReactNode;
  title: string;
  /** Internal address of the record's own page. The title becomes the link (44px target). */
  href?: string;
  /** Language of the title when it differs from the page (CMS text is per language). */
  titleLang?: string;
  /** Summary or Markdown body, already rendered. */
  children?: ReactNode;
  /** At most one link (e.g. "Watch the sermon"). */
  action?: ReactNode;
}

export interface EntryListProps {
  entries: readonly Entry[];
  /** Heading level of each entry title inside the page outline. Defaults to 3. */
  headingLevel?: 2 | 3;
  /** Accessible name for the list (usually the section heading text). */
  label?: string;
  className?: string;
}

/**
 * Editorial single-column list for CMS records (announcements, sermons, ministries, testimonies):
 * hairline dividers, meta line, Anek Tamil / Inter Tight title, body, one optional action.
 * Same row rhythm as ScheduleList. Static: no gradient, no animation.
 */
export function EntryList({ entries, headingLevel = 3, label, className }: EntryListProps) {
  const H = `h${headingLevel}` as "h2" | "h3";
  return (
    <ul className={cx(styles.list, className)} role="list" aria-label={label}>
      {entries.map((e) => (
        <li key={e.id} className={styles.row} data-entry-id={e.id}>
          {e.meta ? <p className={styles.meta}>{e.meta}</p> : null}
          <H className={styles.title} lang={e.titleLang}>
            {e.href ? <Link href={e.href} className={styles.titleLink}>{e.title}</Link> : e.title}
          </H>
          {e.children ? <div className={styles.body} lang={e.titleLang}>{e.children}</div> : null}
          {e.action ? <div className={styles.action}>{e.action}</div> : null}
        </li>
      ))}
    </ul>
  );
}
