import type { ReactNode } from "react";
import { SiteFooter, SiteHeader, type NavItem } from "@/design-system/components";
import { t, type Locale } from "@/content/ui-strings";
import { churchName } from "@/content/church";
import { loadMenuPages } from "@/server/cms/public-site";
import { formsOpenToEveryone } from "@/server/forms/mode";
import { footerNav, headerNav, href, type PublicRoute } from "./site";
import styles from "../public.module.css";

/**
 * Shared public page shell: header (approved links, one CTA), <main id="main">, footer with the
 * fixed pages and the church's published CMS pages. Every public page uses it so the visual
 * language stays one system. `currentPath` overrides the route for pages without a fixed route
 * (CMS pages, detail pages).
 */
export async function PublicShell({
  locale, route, currentPath, cta, children,
}: { locale: Locale; route: PublicRoute; currentPath?: string; cta?: NavItem; children: ReactNode }) {
  const pages = await loadMenuPages(locale);
  return (
    <div className={styles.shell}>
      <SiteHeader
        locale={locale}
        navItems={headerNav(locale)}
        currentPath={currentPath ?? href(locale, route)}
        cta={cta ?? { href: href(locale, "worshipTimes"), label: t("cta.joinFriday", locale) }}
      />
      <main id="main">{children}</main>
      <SiteFooter locale={locale} name={churchName} navItems={footerNav(locale, pages, formsOpenToEveryone() ? ["prayer", "gallery"] : [])} note={t("schedule.timezone", locale)} />
    </div>
  );
}
