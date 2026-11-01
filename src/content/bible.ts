/**
 * Bible verse records for the Verse Showcase Card.
 *
 * Gate 0: Tamil = BSI Tamil Bible (edition to confirm: O.V. or re-edited), English = NKJV.
 * Reproduction permission is NOT yet confirmed, so only clearly labelled placeholders exist.
 * Never add verse wording here or anywhere in the codebase; real verses come from
 * church-approved CMS records (Phase 4/5) once permission is documented.
 */
import type { Locale } from "./ui-strings";
import { t } from "./ui-strings";

export interface VerseRecord {
  /** Stable ID from the CMS. */
  id: string;
  reference: Record<Locale, string>;
  text: Partial<Record<Locale, string>>;
  translation: Record<Locale, string>;
  /** Exact credit line required by the publishers' permission terms. */
  publisherCredit: string;
  /** True for the placeholder record; the card then shows the placeholder chip. */
  isPlaceholder: boolean;
}

export const translationLabels: Record<Locale, string> = {
  ta: "BSI Tamil (edition to confirm)",
  en: "NKJV",
};

/** The only verse-shaped record allowed before permission: visibly a placeholder. */
export function placeholderVerse(uiLocale: Locale): VerseRecord {
  return {
    id: "placeholder",
    reference: { ta: t("verse.placeholderReference", "ta"), en: t("verse.placeholderReference", "en") },
    text: { ta: t("verse.placeholderText", "ta"), en: t("verse.placeholderText", "en") },
    translation: translationLabels,
    publisherCredit: t("verse.publisherCredit", uiLocale),
    isPlaceholder: true,
  };
}
