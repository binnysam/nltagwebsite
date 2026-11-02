/**
 * Official NLTAG schedule — Gate 0 decisions (1 Nov 2026). All times Asia/Kuwait.
 *
 * Times, days and locations are CONFIRMED and must not be edited without owner approval.
 * Tamil gathering names were supplied by the owner on 1 Nov 2026 and are reproduced exactly
 * (src/content/tamil-approvals.ts). The time-of-day words காலை / மாலை were approved as
 * recommended. Weekday names and the other formatter phrases below are not in the review
 * record yet (see docs/content/tamil-content-review.md, "Not yet in the record").
 *
 * Rules: "NECK" is written exactly and never expanded. No street address. Cottage Meeting
 * host addresses are private and never published. Sunday School is on FRIDAY (its approved
 * Tamil name ஞாயிறு பள்ளி is a name, not a day; the day shown is always Friday).
 */
import type { Locale, ReviewStatus } from "./ui-strings";

/** 0 = Sunday … 6 = Saturday (JavaScript convention). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type Recurrence =
  | { kind: "weekly"; weekday: Weekday }
  | { kind: "monthly-last"; weekday: Weekday }
  | { kind: "individual" };

export type Venue = { kind: "neck" } | { kind: "members-homes" } | { kind: "varies" };

export interface ScheduleItem {
  id: string;
  name: { en: string; ta: string; taStatus: ReviewStatus; taAlternatives?: readonly string[] };
  recurrence: Recurrence;
  /** 24-hour "HH:MM", Asia/Kuwait. Absent for individually scheduled items. */
  start?: string;
  end?: string;
  venue: Venue;
}

export const schedule: readonly ScheduleItem[] = [
  {
    id: "main-worship",
    name: { en: "Main Worship Service", ta: "சபை ஆராதனை", taStatus: "confirmed" },
    recurrence: { kind: "weekly", weekday: 5 },
    start: "07:30",
    end: "09:30",
    venue: { kind: "neck" },
  },
  {
    id: "sunday-school",
    name: { en: "Sunday School", ta: "ஞாயிறு பள்ளி", taStatus: "confirmed" },
    recurrence: { kind: "weekly", weekday: 5 },
    start: "09:30",
    end: "10:30",
    venue: { kind: "neck" },
  },
  {
    id: "fasting-prayer",
    name: { en: "Fasting Prayer", ta: "உபவாச ஆராதனை", taStatus: "confirmed" },
    recurrence: { kind: "weekly", weekday: 6 },
    start: "19:30",
    end: "20:30",
    venue: { kind: "neck" },
  },
  {
    id: "cottage-meeting",
    name: { en: "Cottage Meeting", ta: "வீட்டு ஜெபக்கூட்டம்", taStatus: "confirmed" },
    recurrence: { kind: "weekly", weekday: 2 },
    start: "19:30",
    end: "20:30",
    venue: { kind: "members-homes" },
  },
  {
    id: "ladies-meeting",
    name: { en: "Ladies Meeting", ta: "ஸ்திரீகள் ஜெபக்கூட்டம்", taStatus: "confirmed" },
    recurrence: { kind: "monthly-last", weekday: 4 },
    start: "19:00",
    end: "21:00",
    venue: { kind: "neck" },
  },
  {
    id: "special-meetings",
    name: { en: "Special Meetings", ta: "விசேஷ ஆராதனைகள்", taStatus: "confirmed" },
    recurrence: { kind: "individual" },
    venue: { kind: "varies" },
  },
];

const weekdayEn = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
/** Tamil weekday names. Not yet in the Tamil approval record. */
const weekdayTa = ["ஞாயிற்றுக்கிழமை", "திங்கட்கிழமை", "செவ்வாய்க்கிழமை", "புதன்கிழமை", "வியாழக்கிழமை", "வெள்ளிக்கிழமை", "சனிக்கிழமை"] as const;

/** Formats "19:30" as "7:30". Period word added separately. */
function clock(hhmm: string): { text: string; pm: boolean } {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  const pm = h >= 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return { text: `${h12}:${String(m).padStart(2, "0")}`, pm };
}

/**
 * Tamil period words, approved as recommended on 1 Nov 2026: "மாலை" for the 7–9 PM
 * gatherings, "காலை" for the morning. Change only with owner approval.
 */
const TA_MORNING = "காலை";
const TA_EVENING = "மாலை";

export function formatWhen(item: ScheduleItem, locale: Locale): string {
  const r = item.recurrence;
  if (r.kind === "individual" || !item.start || !item.end) {
    return locale === "ta" ? "தனித்தனியாக அறிவிக்கப்படும்" : "Announced individually";
  }
  const a = clock(item.start);
  const b = clock(item.end);
  if (locale === "en") {
    const day = r.kind === "weekly" ? `Every ${weekdayEn[r.weekday]}` : `Last ${weekdayEn[r.weekday]} of every month`;
    const aSuffix = a.pm === b.pm ? "" : a.pm ? " PM" : " AM";
    return `${day}, ${a.text}${aSuffix} – ${b.text} ${b.pm ? "PM" : "AM"}`;
  }
  const day =
    r.kind === "weekly"
      ? `ஒவ்வொரு ${weekdayTa[r.weekday]}`
      : `ஒவ்வொரு மாதத்தின் கடைசி ${weekdayTa[r.weekday]}`;
  return `${day}, ${b.pm ? TA_EVENING : TA_MORNING} ${a.text} – ${b.text}`;
}

export function formatWhere(item: ScheduleItem, locale: Locale): string {
  return venueLabel(item.venue.kind, locale);
}

/** Public venue wording. NECK exactly; members' homes never with an address. */
export function venueLabel(kind: Venue["kind"], locale: Locale): string {
  switch (kind) {
    case "neck":
      return "NECK";
    case "members-homes":
      return locale === "ta" ? "சபை அங்கத்தினர்களின் வீடுகளில்" : "Church members' homes";
    case "varies":
      return locale === "ta" ? "நிகழ்ச்சியைப் பொறுத்து" : "Depends on the event";
  }
}
