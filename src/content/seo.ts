import type { Locale } from "./ui-strings";

/**
 * Meta descriptions for the home page and the public list pages (search results and link
 * previews). English approved by the owner on 10 Nov 2026, exactly as proposed in
 * docs/reports/staging-acceptance-qa-2026-11.md §12.5. Tamil is pending the owner's review: the
 * drafts live only in that report and are never published from here, so Tamil pages carry no
 * description until approved Tamil is added below.
 *
 * Only these four pages use these texts. Detail and CMS pages keep their own (or none).
 */
export type ListPage = "home" | "sermons" | "worshipTimes" | "testimonies";

export const listDescriptions: Record<ListPage, { en: string; ta: string | null }> = {
  home: {
    en: "New Life Tamil AG Church in Kuwait. Worship schedule, sermons, testimonies and upcoming special meetings, in Tamil and English.",
    ta: null,
  },
  sermons: {
    en: "Sermons from New Life Tamil AG Church, Kuwait. Search by title or speaker.",
    ta: null,
  },
  // "Events": special meetings are shown on the Worship times page.
  worshipTimes: {
    en: "Worship schedule and upcoming special meetings of New Life Tamil AG Church. All times are Kuwait time.",
    ta: null,
  },
  testimonies: {
    en: "Testimonies from New Life Tamil AG Church, Kuwait. Each testimony is published with the author's permission after the church has read it.",
    ta: null,
  },
};

/** The page's description in this language, or undefined while that language is not approved. */
export function listDescription(locale: Locale, page: ListPage): string | undefined {
  return listDescriptions[page][locale] ?? undefined;
}
