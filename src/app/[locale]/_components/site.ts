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

/** Address key of a CMS record's own page: its slug when it has one, otherwise its id. */
export const itemKey = (item: { id: string; slug: string | null }) => item.slug || item.id;

/** Own page of a sermon or testimony: /{locale}/sermons/{key}, /{locale}/testimonies/{key}. */
export const detailHref = (locale: Locale, route: "sermons" | "testimonies", item: { id: string; slug: string | null }) =>
  `${href(locale, route)}/${itemKey(item)}`;

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

/**
 * Footer: every fixed public page, then the church's own published CMS pages (titles from the CMS,
 * already in the page language; see `toMenuPages` in src/server/cms/public-site.ts).
 */
export const footerNav = (locale: Locale, pages: readonly { slug: string; title: string }[] = []): NavItem[] => [
  ...(["home", "about", "worshipTimes", "sermons", "ministries", "testimonies", "contact"] as const).map((r) => item(locale, r)),
  ...pages.map((p) => ({ href: `/${locale}/${p.slug}`, label: p.title })),
];

/**
 * Page metadata: unique title per page and language, self canonical, hreflang ta/en and
 * x-default → /ta, Open Graph / Twitter preview tags (title, description, church name, URL). Indexing stays off (root layout `noindex`) until the launch gate.
 */
export function pageMetadata(locale: Locale, route: PublicRoute, opts: { title?: string; description?: string; path?: string } = {}): Metadata {
  const path = opts.path ?? publicRoutes[route];
  const title = opts.title ?? (route === "home" ? churchName[locale] : routeLabel(locale, route));
  const fullTitle = `${title} · NLTAG`;
  const description = opts.description || undefined;
  return {
    title: route === "home" ? { absolute: fullTitle } : title,
    description,
    // Link previews (WhatsApp, Facebook, X …). No image until the church supplies a logo or photo.
    openGraph: { type: "website", siteName: churchName[locale], title: fullTitle, description, url: `/${locale}${path}` },
    twitter: { card: "summary", title: fullTitle, description },
    alternates: {
      canonical: `/${locale}${path}`,
      languages: { ta: `/ta${path}`, en: `/en${path}`, "x-default": `/ta${path}` },
    },
    robots: { index: false, follow: false },
  };
}
