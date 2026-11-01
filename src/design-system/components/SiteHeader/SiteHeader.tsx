import Link from "next/link";
import type { Locale } from "@/content/ui-strings";
import { t } from "@/content/ui-strings";
import { Container } from "@/design-system/primitives";
import { ButtonLink } from "../Button";
import { LanguageSwitch } from "../LanguageSwitch";
import { HeaderShell, MenuButton, MenuPanel } from "./SiteHeader.client";
import styles from "./site-header.module.css";

export interface NavItem {
  href: string;
  label: string;
}

export interface SiteHeaderProps {
  locale: Locale;
  /** Primary links, page language. Pass only routes that exist. */
  navItems?: readonly NavItem[];
  /** Path of the current page, for aria-current. */
  currentPath?: string;
  /** Single CTA. Defaults to none until the target page exists. */
  cta?: NavItem;
}

/**
 * Site header: wordmark, primary navigation (≥1280px), language switch, one pill CTA
 * (≥768px) and a disclosure menu on smaller screens. Sticky; gains shadow-1 once scrolled.
 */
export function SiteHeader({ locale, navItems = [], currentPath, cta }: SiteHeaderProps) {
  const navLabel = t("nav.primary", locale);
  const hasMenu = navItems.length > 0 || Boolean(cta);
  return (
    <HeaderShell className={styles.header}>
      <a href="#main" className="ds-skip-link">{t("nav.skipToContent", locale)}</a>
      <Container className={styles.bar}>
        <Link href={`/${locale}`} className={styles.wordmark} lang="en" aria-label="NLTAG — New Life Tamil AG Church">
          NLTAG
        </Link>
        {navItems.length > 0 ? (
          <nav aria-label={navLabel} className={styles.nav}>
            <ul className={styles.navList} role="list">
              {navItems.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className={styles.navLink} aria-current={item.href === currentPath ? "page" : undefined}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
        <div className={styles.end}>
          <LanguageSwitch locale={locale} />
          {cta ? (
            <ButtonLink href={cta.href} className={styles.cta}>
              {cta.label}
            </ButtonLink>
          ) : null}
          {hasMenu ? (
            <MenuButton className={styles.menuButton} openLabel={t("nav.menu", locale)} closeLabel={t("nav.closeMenu", locale)} />
          ) : null}
        </div>
      </Container>
      {hasMenu ? (
        <MenuPanel navLabel={navLabel} className={styles.panel}>
          <Container>
            <ul className={styles.panelList} role="list">
              {navItems.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className={styles.panelLink} aria-current={item.href === currentPath ? "page" : undefined}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
            {cta ? (
              <ButtonLink href={cta.href} fullWidth>
                {cta.label}
              </ButtonLink>
            ) : null}
          </Container>
        </MenuPanel>
      ) : null}
    </HeaderShell>
  );
}
