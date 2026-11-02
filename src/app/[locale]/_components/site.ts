import type { Metadata } from "next";
import { t, type Locale, type UiStringKey } from "@/content/ui-strings";
import { churchName } from "@/content/church";
import type { NavItem } from "@/design-system/components";

/** Public routes (Phase 5). Paths are the same in both languages; only the prefix changes. */
export const publicRoutes = {
  home: "",
  about: "/about",
  worshipTimes: "/worship-times",
  sermons: "/sermons",
  ministries: "/ministries",
  testimonies: "/testimonies",
  contact: "/contact",
} as const;
export type PublicRoute = keyof typeof publicRoutes;

export const href = (locale: Locale, route: PublicRoute) => `/${locale}${publicRoutes[route]}`;

const labelKey: Record<PublicRoute, UiStringKey> = {
  home: "nav.home",
  about: "nav.about",
  worshipTimes: "nav.worshipTimes",
  sermons: "nav.sermons",
  ministries: "nav.ministries",
  testimonies: "nav.testimonies",
  contact: "nav.contact",
};
export const routeLabel = (locale: Locale, route: PublicRoute) => t(labelKey[route], locale);

const item = (locale: Locale, route: PublicRoute): NavItem => ({ href: href(locale, route), label: routeLabel(locale, route) });

/**
 * Header: four approved labels, as designed in Phase 2 (four links + language switch + CTA at
 * 1280px). The wordmark links home; "Home" is in the footer. Five Tamil links overflowed at 1280px.
 */
export const headerNav = (locale: Locale) => (["about", "worshipTimes", "sermons", "contact"] as const).map((r) => item(locale, r));

/** Footer: every public page. */
export const footerNav = (locale: Locale) =>
  (["home", "about", "worshipTimes", "sermons", "ministries", "testimonies", "contact"] as const).map((r) => item(locale, r));

/**
 * Page metadata: unique title per page and language, self canonical, hreflang ta/en and
 * x-default → /ta. Indexing stays off (root layout `noindex`) until the launch gate.
 */
export function pageMetadata(locale: Locale, route: PublicRoute, opts: { title?: string; description?: string; path?: string } = {}): Metadata {
  const path = opts.path ?? publicRoutes[route];
  const title = opts.title ?? (route === "home" ? churchName[locale] : routeLabel(locale, route));
  return {
    title: route === "home" ? { absolute: `${title} · NLTAG` } : title,
    description: opts.description || undefined,
    alternates: {
      canonical: `/${locale}${path}`,
      languages: { ta: `/ta${path}`, en: `/en${path}`, "x-default": `/ta${path}` },
    },
    robots: { index: false, follow: false },
  };
}
