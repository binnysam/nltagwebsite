import type { ReactNode } from "react";
import { SiteFooter, SiteHeader, type NavItem } from "@/design-system/components";
import { t, type Locale } from "@/content/ui-strings";
import { churchName } from "@/content/church";
import { footerNav, headerNav, href, type PublicRoute } from "./site";

/**
 * Shared public page shell: header (five approved links, one CTA), <main id="main">, footer.
 * Every public page uses it so the visual language stays one system.
 */
export function PublicShell({ locale, route, cta, children }: { locale: Locale; route: PublicRoute; cta?: NavItem; children: ReactNode }) {
  return (
    <>
      <SiteHeader
        locale={locale}
        navItems={headerNav(locale)}
        currentPath={href(locale, route)}
        cta={cta ?? { href: href(locale, "worshipTimes"), label: t("cta.joinFriday", locale) }}
      />
      <main id="main">{children}</main>
      <SiteFooter locale={locale} name={churchName} navItems={footerNav(locale)} note={t("schedule.timezone", locale)} />
    </>
  );
}
