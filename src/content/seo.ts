import type { Locale } from "./ui-strings";
import { seoApprovedTamil } from "./tamil-approvals.ts";

/**
 * Meta descriptions for the home page and the public list pages (search results and link
 * previews). English and Tamil approved by the owner on 10 Nov 2026, exactly as proposed in
 * docs/reports/staging-acceptance-qa-2026-11.md §12.5. The Tamil is kept in the approval record
 * (`seoApprovedTamil` in tamil-approvals.ts, listed in docs/content/tamil-content-review.md).
 *
 * Only these four pages use these texts. Detail and CMS pages keep their own (or none).
 */
export type ListPage = "home" | "sermons" | "worshipTimes" | "testimonies";

export const listDescriptions: Record<ListPage, { en: string; ta: string }> = {
  home: {
    en: "New Life Tamil AG Church in Kuwait. Worship schedule, sermons, testimonies and upcoming special meetings, in Tamil and English.",
    ta: seoApprovedTamil["seo.home"],
  },
  sermons: {
    en: "Sermons from New Life Tamil AG Church, Kuwait. Search by title or speaker.",
    ta: seoApprovedTamil["seo.sermons"],
  },
  // "Events": special meetings are shown on the Worship times page.
  worshipTimes: {
    en: "Worship schedule and upcoming special meetings of New Life Tamil AG Church. All times are Kuwait time.",
    ta: seoApprovedTamil["seo.worshipTimes"],
  },
  testimonies: {
    en: "Testimonies from New Life Tamil AG Church, Kuwait. Each testimony is published with the author's permission after the church has read it.",
    ta: seoApprovedTamil["seo.testimonies"],
  },
};

/** The page's approved description in this language. */
export function listDescription(locale: Locale, page: ListPage): string {
  return listDescriptions[page][locale];
}
