import type { Locale } from "@/content/ui-strings";

/** Church time zone (Gate 0). All dates and the daily verse use Kuwait time. */
export const CHURCH_TIME_ZONE = "Asia/Kuwait";

const intlLocale: Record<Locale, string> = { ta: "ta-IN", en: "en-GB" };

/** "1 நவம்பர், 2026" / "1 November 2026", computed for the Kuwait calendar date. */
export function formatKuwaitDate(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale[locale], {
    timeZone: CHURCH_TIME_ZONE,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

/** YYYY-MM-DD of the Kuwait calendar day (stable key for deterministic daily selection). */
export function kuwaitDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CHURCH_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
  return parts;
}
