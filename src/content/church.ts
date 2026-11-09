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

/**
 * The church's verified location for the Contact map. CONTENT REQUIRED: null until the owner
 * supplies the address wording and coordinates and approves publishing them (roadmap D3/C2).
 * Never fill this from a guess or a web search. Cottage Meeting hosts are never published.
 */
export const churchLocation: null | { lat: number; lng: number; addressTa: string; addressEn: string } = null;
