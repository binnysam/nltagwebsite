import Link from "next/link";
import type { Locale } from "@/content/ui-strings";
import { t } from "@/content/ui-strings";
import { Container } from "@/design-system/primitives";
import { otherLocale } from "@/lib/i18n";
import type { NavItem } from "../SiteHeader";
import styles from "./site-footer.module.css";

export interface SiteFooterProps {
  locale: Locale;
  /** Confirmed church name in both languages (src/content/church.ts). */
  name: Record<Locale, string>;
  /** Links to routes that exist, page language. */
  navItems: readonly NavItem[];
  /** One short line of confirmed information, e.g. the time-zone note. */
  note?: string;
}

/**
 * Site footer: wordmark and church name (page language, other language beneath), footer
 * navigation with 44px rows, one short note. Paper surface, hairline top edge. Static.
 */
export function SiteFooter({ locale, name, navItems, note }: SiteFooterProps) {
  const other = otherLocale(locale);
  return (
    <footer className={styles.footer}>
      <Container className={styles.inner}>
        <div className={styles.identity}>
          <Link href={`/${locale}`} className={styles.wordmark} lang="en" aria-label="NLTAG — New Life Tamil AG Church">
            NLTAG
          </Link>
          <p className={styles.name} lang={locale}>{name[locale]}</p>
          <p className={styles.alt} lang={other}>{name[other]}</p>
        </div>
        {navItems.length ? (
          <nav aria-label={t("footer.nav", locale)}>
            <ul className={styles.navList} role="list">
              {navItems.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className={styles.navLink}>{item.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
        {note ? <p className={styles.note}>{note}</p> : null}
      </Container>
    </footer>
  );
}
