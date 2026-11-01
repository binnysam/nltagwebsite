/**
 * NLTAG interface strings (UI chrome only — never church facts).
 *
 * Review status:
 *   - "confirmed"     → approved by the church/owner (Gate 0 or later).
 *   - "proposed"      → English interface wording written by the project team; owner may edit.
 *   - "draft-review"  → Tamil wording awaiting church review. Must not go live on a public
 *                        page until changed to "confirmed". New strings start here.
 *
 * All existing Tamil was approved by the owner on 1 Nov 2026 (src/content/tamil-approvals.ts).
 * Owner-supplied Tamil is reproduced exactly; never rephrase it. The approval record lives in
 * docs/content/tamil-content-review.md and is generated from the same entries. Do not add church facts (names, times, addresses) here: those belong in
 * src/content/schedule.ts or the CMS.
 */

export type ReviewStatus = "confirmed" | "proposed" | "draft-review";

export interface UiString {
  en: string;
  ta: string;
  enStatus: ReviewStatus;
  taStatus: ReviewStatus;
  /** Alternative Tamil wording offered to reviewers. */
  taAlternatives?: readonly string[];
  /** Note for the church reviewer. */
  note?: string;
  /**
   * Shorter Tamil wording offered where the recommended text does not fit its control
   * (for example a one-line pill at 390px). Highlighted separately in the review sheet.
   * Draft only: it is never rendered until the church picks it and taStatus is "confirmed".
   */
  taShortAlternative?: string;
}

const s = (
  en: string,
  ta: string,
  extra: Partial<Pick<UiString, "taAlternatives" | "taShortAlternative" | "note" | "enStatus" | "taStatus">> = {},
): UiString => ({ en, ta, enStatus: "proposed", taStatus: "draft-review", ...extra });

/** Tamil approved by the owner (1 Nov 2026). Use `s()` for any new string. */
const c = (
  en: string,
  ta: string,
  extra: Partial<Pick<UiString, "note" | "enStatus">> = {},
): UiString => ({ en, ta, enStatus: "proposed", taStatus: "confirmed", ...extra });

export const uiStrings = {
  // Navigation
  "nav.home": c("Home", "முகப்பு"),
  "nav.about": c("About", "சபை வரலாறு"),
  "nav.worshipTimes": c("Worship times", "ஆராதனை ஒழுங்குமுறை"),
  "nav.sermons": c("Sermons", "தேவ செய்திகள்"),
  "nav.contact": c("Contact", "தொடர்பு கொள்ள"),
  "nav.menu": c("Menu", "மெனு"),
  "nav.closeMenu": c("Close menu", "மெனுவை மூடு"),
  "nav.primary": c("Main navigation", "முதன்மை பக்கம்"),
  "nav.skipToContent": c("Skip to main content", "முதன்மை பகுதிக்கு செல்லவும்"),

  // Calls to action
  "cta.joinFriday": c("Join us this Friday", "ஆராதனையில் இணைந்துகொள்ளுங்கள்", {
    enStatus: "confirmed",
    note: "Gate 0 replaced 'Join us this Sunday' with the English wording. Tamil supplied by the owner on 1 Nov 2026.",
  }),

  // Language switch
  "lang.label": c("Language", "மொழி"),
  "lang.ta": s("தமிழ்", "தமிழ்", { enStatus: "confirmed", taStatus: "confirmed" }),
  "lang.en": s("English", "English", { enStatus: "confirmed", taStatus: "confirmed" }),

  // Hero motion control (WCAG 2.2.2)
  "hero.pause": c("Pause background animation", "பின்னணி அசைவை நிறுத்து"),
  "hero.play": c("Play background animation", "பின்னணி அசைவை தொடங்கு"),

  // Bible Verse Showcase Card
  "verse.today": c("Today's verse", "இன்றைய தேவ வசனம்"),
  "verse.placeholderChip": c("Placeholder", "மாதிரி", {
    note: "Shown until Bible reproduction permission is confirmed.",
  }),
  "verse.placeholderText": c(
    "Verse text appears here once reproduction permission is confirmed.",
    "மறுபதிப்பு அனுமதி உறுதியானதும் வசனம் இங்கே இடம்பெறும்.",
  ),
  "verse.placeholderReference": c("Reference", "வசனக் குறிப்பு"),
  "verse.publisherCredit": c(
    "Publisher credit line required",
    "வெளியீட்டாளர் நன்றிக் குறிப்பு தேவை",
    { note: "Exact credit lines come from the BSI and NKJV permission letters." },
  ),
  "verse.share": c("Share", "பகிர்"),
  "verse.download": c("Download PNG", "PNG பதிவிறக்கு"),
  "verse.fallback": c(
    "Today's verse will be published soon.",
    "இன்றைய வசனம் விரைவில் வெளியிடப்படும்.",
  ),

  // Schedule
  "schedule.heading": c("Worship schedule", "ஆராதனை அட்டவணை", { enStatus: "confirmed" }),
  "schedule.col.name": c("Gathering", "கூடுகை"),
  "schedule.col.when": c("When", "நேரம்"),
  "schedule.col.where": c("Where", "இடம்"),
  "schedule.timezone": c("All times are Kuwait time.", "அனைத்து நேரங்களும் குவைத் நேரம்."),

  // Membership status
  "status.draft": c("Draft", "வரைவு"),
  "status.emailVerified": c("Email verified", "மின்னஞ்சல் சரிபார்க்கப்பட்டது"),
  "status.pendingReview": c("Pending review", "பரிசீலனையில்"),
  "status.correctionRequested": c("Correction requested", "திருத்தம் கோரப்பட்டுள்ளது"),
  "status.active": c("Active", "செயலில்"),
  "status.rejected": c("Rejected", "நிராகரிக்கப்பட்டது"),

  // Forms
  "form.required": c("Required", "அவசியம்"),
  "form.optional": c("Optional", "விருப்பத்தேர்வு"),
  "form.errorRequired": c("This field is required.", "இந்தப் புலம் அவசியம்."),
  "form.loading": c("Please wait…", "காத்திருக்கவும்…"),

  // Holding page (pre-launch)
  "site.inPreparation": c("This website is being prepared.", "இந்த இணையதளம் தயாராகி வருகிறது."),

  // Special meetings
  "special.typeLabel": c("Special meeting", "சிறப்புக் கூட்டம்"),
  "special.empty": c(
    "Special meetings are announced individually.",
    "சிறப்புக் கூட்டங்கள் தனித்தனியாக அறிவிக்கப்படும்.",
  ),
} as const satisfies Record<string, UiString>;

export type UiStringKey = keyof typeof uiStrings;
export type Locale = "ta" | "en";

export function t(key: UiStringKey, locale: Locale): string {
  return uiStrings[key][locale];
}
