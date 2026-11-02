import { ownerSuppliedTamil } from "./tamil-approvals";

/**
 * Confirmed church identity only. English official name: master prompt (confirmed requirement).
 * Tamil name: owner-supplied on 1 Nov 2026 (approval record item preview.heroTitle), reproduced exactly.
 * Anything else about the church (welcome text, history, beliefs) is CONTENT REQUIRED.
 */
export const churchName = {
  en: "New Life Tamil AG Church",
  ta: ownerSuppliedTamil["preview.heroTitle"].ta,
} as const;

/**
 * Public origin for canonical and hreflang URLs. nltagkuwait.com is the owner-approved sole
 * production site (2 Nov 2026). Indexing stays off (noindex) until the launch gate.
 */
export const siteOrigin = "https://nltagkuwait.com";
