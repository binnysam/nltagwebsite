/**
 * Pure helpers for public list pages (Phase A, Nov 2026): text search, speaker filter and
 * pagination over records already loaded through the published-content rules. No database access;
 * unit-tested in tests/unit/listing.test.ts.
 */

/** Records per page on the public Sermons page. */
export const SERMONS_PAGE_SIZE = 10;
/** Longest search text read from the URL. */
export const MAX_QUERY = 100;

const fold = (s: string, locale: string) => s.normalize("NFC").toLocaleLowerCase(locale);

export interface SermonFilter {
  q: string;
  speaker: string;
}

/** Reads ?q=&speaker= safely (first value, trimmed, length-capped, NFC). */
export function readSermonFilter(sp: Record<string, string | string[] | undefined>): SermonFilter {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  return {
    q: one(sp.q).normalize("NFC").trim().slice(0, MAX_QUERY),
    speaker: one(sp.speaker).normalize("NFC").trim().slice(0, 200),
  };
}

/** Distinct speakers, sorted for the page language. */
export function speakersOf(items: readonly { speaker: string }[], locale: string): string[] {
  return [...new Set(items.map((i) => i.speaker.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, locale));
}

/**
 * Every search word must appear (case-insensitive) in the title, summary, text, speaker or Bible
 * reference; the speaker filter is an exact match. Order is kept.
 */
export function filterSermons<T extends { title: string; summary: string; bodyMd: string; speaker: string; bibleReference: string }>(
  items: readonly T[], f: SermonFilter, locale: string,
): T[] {
  const words = fold(f.q, locale).split(/\s+/).filter(Boolean);
  return items.filter((s) => {
    if (f.speaker && s.speaker.trim() !== f.speaker) return false;
    if (!words.length) return true;
    const hay = fold([s.title, s.summary, s.bodyMd, s.speaker, s.bibleReference].join("\n"), locale);
    return words.every((w) => hay.includes(w));
  });
}

export interface Page<T> {
  items: T[];
  page: number;
  totalPages: number;
}

/** 1-based page; out-of-range or malformed values clamp to the nearest valid page. */
export function paginate<T>(items: readonly T[], rawPage: string | string[] | undefined, size: number): Page<T> {
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const n = Number.parseInt(Array.isArray(rawPage) ? (rawPage[0] ?? "") : (rawPage ?? ""), 10);
  const page = Number.isFinite(n) ? Math.min(Math.max(n, 1), totalPages) : 1;
  return { items: items.slice((page - 1) * size, page * size), page, totalPages };
}

/** Query string for a list page, keeping only non-default values. */
export function listQuery(f: Partial<SermonFilter>, page = 1): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.speaker) p.set("speaker", f.speaker);
  if (page > 1) p.set("page", String(page));
  const s = p.toString();
  return s ? `?${s}` : "";
}
