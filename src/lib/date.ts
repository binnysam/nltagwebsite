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

/**
 * Kuwait does not observe daylight saving time: Asia/Kuwait is UTC+03:00 all year (IANA tz data).
 * The admin enters times as Kuwait wall-clock time; the database stores UTC.
 */
const KUWAIT_OFFSET_MINUTES = 180;

/** "2026-11-06T19:30" (Kuwait wall clock, from <input type="datetime-local">) → UTC Date. Null if malformed. */
export function kuwaitLocalToUtc(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number) as [number, number, number, number, number, number];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const utc = Date.UTC(y, mo - 1, d, h, mi) - KUWAIT_OFFSET_MINUTES * 60_000;
  const back = new Date(utc + KUWAIT_OFFSET_MINUTES * 60_000);
  if (back.getUTCDate() !== d || back.getUTCMonth() !== mo - 1) return null; // e.g. 31 February
  return new Date(utc);
}

/** UTC Date → "YYYY-MM-DDTHH:mm" in Kuwait time, for datetime-local inputs. */
export function utcToKuwaitLocal(date: Date | null | undefined): string {
  if (!date) return "";
  return new Date(date.getTime() + KUWAIT_OFFSET_MINUTES * 60_000).toISOString().slice(0, 16);
}

/** "Fri 6 Nov 2026, 19:30" in Kuwait time (admin interface, English). */
export function formatKuwaitDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: CHURCH_TIME_ZONE, weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(date);
}
