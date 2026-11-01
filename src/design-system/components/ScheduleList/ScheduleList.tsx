import type { Locale } from "@/content/ui-strings";
import { t } from "@/content/ui-strings";
import { type ScheduleItem, formatWhen, formatWhere } from "@/content/schedule";
import { otherLocale } from "@/lib/i18n";
import styles from "./schedule-list.module.css";

export interface ScheduleListProps {
  items: readonly ScheduleItem[];
  locale: Locale;
}

/**
 * Worship schedule as an editorial list. Each row: name in the page language with the other
 * language beneath, then when and where. Data comes only from src/content/schedule.ts
 * (Gate 0) or, later, the CMS. The column labels (When / Where) are visually implied by
 * position and given to screen readers as visually hidden prefixes.
 */
export function ScheduleList({ items, locale }: ScheduleListProps) {
  const other = otherLocale(locale);
  return (
    <div className={styles.wrap}>
      <ul className={styles.list} role="list">
        {items.map((item) => (
          <li key={item.id} className={styles.row} data-schedule-id={item.id}>
            <span className={styles.names}>
              <span className={styles.name} lang={locale}>{item.name[locale]}</span>
              <span className={styles.alt} lang={other}>{item.name[other]}</span>
            </span>
            <span className={styles.when}>
              <span className="ds-visually-hidden">{t("schedule.col.when", locale)}: </span>
              {formatWhen(item, locale)}
            </span>
            <span className={styles.where}>
              <span className="ds-visually-hidden">{t("schedule.col.where", locale)}: </span>
              {formatWhere(item, locale)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
