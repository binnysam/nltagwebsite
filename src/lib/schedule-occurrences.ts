import type { ScheduleItem } from "@/content/schedule";
import { kuwaitLocalToUtc } from "./date";

export interface Occurrence {
  itemId: string;
  startsAt: Date;
  endsAt: Date;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Next occurrences of the fixed Gate 0 schedule within `days` Kuwait calendar days from `now`
 * (meetings already finished are skipped). Weekly and "last <weekday> of the month" rules only;
 * individually announced meetings come from the CMS.
 */
export function upcomingOccurrences(items: readonly ScheduleItem[], now: Date, days = 7): Occurrence[] {
  const out: Occurrence[] = [];
  const kuwaitToday = new Date(now.getTime() + 3 * 3600_000); // calendar arithmetic in Kuwait time
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.UTC(kuwaitToday.getUTCFullYear(), kuwaitToday.getUTCMonth(), kuwaitToday.getUTCDate() + i));
    const weekday = d.getUTCDay();
    const ymd = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    const lastOfMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 7)).getUTCMonth() !== d.getUTCMonth();
    for (const item of items) {
      const r = item.recurrence;
      if (r.kind === "individual" || !item.start || !item.end) continue;
      if (r.weekday !== weekday) continue;
      if (r.kind === "monthly-last" && !lastOfMonth) continue;
      const startsAt = kuwaitLocalToUtc(`${ymd}T${item.start}`)!;
      const endsAt = kuwaitLocalToUtc(`${ymd}T${item.end}`)!;
      if (endsAt.getTime() <= now.getTime()) continue;
      out.push({ itemId: item.id, startsAt, endsAt });
    }
  }
  return out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}
