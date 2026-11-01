import type { Locale } from "@/content/ui-strings";

export const locales = ["ta", "en"] as const satisfies readonly Locale[];
/** Tamil is the default locale (Gate 0). */
export const defaultLocale: Locale = "ta";

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

export function otherLocale(locale: Locale): Locale {
  return locale === "ta" ? "en" : "ta";
}

/** Swaps the leading locale segment of a pathname, keeping the rest of the path. */
export function switchLocalePath(pathname: string, target: Locale): string {
  const parts = pathname.split("/");
  if (parts[1] && isLocale(parts[1])) {
    parts[1] = target;
    return parts.join("/") || `/${target}`;
  }
  return `/${target}${pathname === "/" ? "" : pathname}`;
}
