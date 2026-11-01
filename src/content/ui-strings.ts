/**
 * NLTAG interface strings (UI chrome only — never church facts).
 *
 * Review status:
 *   - "confirmed"     → approved by the church/owner (Gate 0 or later).
 *   - "proposed"      → English interface wording written by the project team; owner may edit.
 *   - "draft-review"  → Tamil wording awaiting church review. Must not go live on a public
 *                        page until changed to "confirmed".
 *
 * The full review sheet lives in docs/content/tamil-content-review.md and is generated from
 * the same entries. Do not add church facts (names, times, addresses) here: those belong in
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
}

const s = (
  en: string,
  ta: string,
  extra: Partial<Pick<UiString, "taAlternatives" | "note" | "enStatus" | "taStatus">> = {},
): UiString => ({ en, ta, enStatus: "proposed", taStatus: "draft-review", ...extra });

export const uiStrings = {
  // Navigation
  "nav.home": s("Home", "முகப்பு"),
  "nav.about": s("About", "எங்களைப் பற்றி", { taAlternatives: ["சபையைப் பற்றி"] }),
  "nav.worshipTimes": s("Worship times", "ஆராதனை நேரங்கள்", { taAlternatives: ["கூடுகை நேரங்கள்"] }),
  "nav.sermons": s("Sermons", "பிரசங்கங்கள்", { taAlternatives: ["தேவ செய்திகள்"] }),
  "nav.contact": s("Contact", "தொடர்பு", { taAlternatives: ["தொடர்பு கொள்ள"] }),
  "nav.menu": s("Menu", "மெனு", { taAlternatives: ["பட்டியல்"] }),
  "nav.closeMenu": s("Close menu", "மெனுவை மூடு"),
  "nav.primary": s("Main navigation", "முதன்மை வழிசெலுத்தல்"),
  "nav.skipToContent": s("Skip to main content", "முதன்மை உள்ளடக்கத்திற்குச் செல்லவும்"),

  // Calls to action
  "cta.joinFriday": s("Join us this Friday", "இந்த வெள்ளிக்கிழமை எங்களுடன் இணையுங்கள்", {
    enStatus: "confirmed",
    taAlternatives: ["இந்த வெள்ளிக்கிழமை ஆராதனைக்கு வாருங்கள்"],
    note: "Gate 0 replaced 'Join us this Sunday' with this wording.",
  }),

  // Language switch
  "lang.label": s("Language", "மொழி"),
  "lang.ta": s("தமிழ்", "தமிழ்", { enStatus: "confirmed", taStatus: "confirmed" }),
  "lang.en": s("English", "English", { enStatus: "confirmed", taStatus: "confirmed" }),

  // Hero motion control (WCAG 2.2.2)
  "hero.pause": s("Pause background animation", "பின்னணி அசைவை நிறுத்து"),
  "hero.play": s("Play background animation", "பின்னணி அசைவைத் தொடங்கு"),

  // Bible Verse Showcase Card
  "verse.today": s("Today's verse", "இன்றைய வசனம்", { taAlternatives: ["இன்றைய தேவ வசனம்"] }),
  "verse.placeholderChip": s("Placeholder", "மாதிரி", {
    note: "Shown until Bible reproduction permission is confirmed.",
  }),
  "verse.placeholderText": s(
    "Verse text appears here once reproduction permission is confirmed.",
    "மறுபதிப்பு அனுமதி உறுதியானதும் வசனம் இங்கே இடம்பெறும்.",
  ),
  "verse.placeholderReference": s("Reference", "வசனக் குறிப்பு"),
  "verse.publisherCredit": s(
    "Publisher credit line required",
    "வெளியீட்டாளர் நன்றிக் குறிப்பு தேவை",
    { note: "Exact credit lines come from the BSI and NKJV permission letters." },
  ),
  "verse.share": s("Share", "பகிர்"),
  "verse.download": s("Download PNG", "PNG பதிவிறக்கு", { taAlternatives: ["படமாகப் பதிவிறக்கு"] }),
  "verse.fallback": s(
    "Today's verse will be published soon.",
    "இன்றைய வசனம் விரைவில் வெளியிடப்படும்.",
  ),

  // Schedule
  "schedule.heading": s("Worship schedule", "ஆராதனை அட்டவணை", {
    enStatus: "confirmed",
    taAlternatives: ["ஆராதனை நேரங்கள்"],
  }),
  "schedule.col.name": s("Gathering", "கூடுகை", { taAlternatives: ["நிகழ்ச்சி"] }),
  "schedule.col.when": s("When", "நேரம்"),
  "schedule.col.where": s("Where", "இடம்"),
  "schedule.timezone": s("All times are Kuwait time.", "அனைத்து நேரங்களும் குவைத் நேரம்."),

  // Membership status (Tamil labels are drafts per Phase 1 §6)
  "status.draft": s("Draft", "வரைவு"),
  "status.emailVerified": s("Email verified", "மின்னஞ்சல் சரிபார்க்கப்பட்டது"),
  "status.pendingReview": s("Pending review", "பரிசீலனையில்"),
  "status.correctionRequested": s("Correction requested", "திருத்தம் கோரப்பட்டுள்ளது"),
  "status.active": s("Active", "செயலில்", { taAlternatives: ["நடப்பில்"] }),
  "status.rejected": s("Rejected", "நிராகரிக்கப்பட்டது"),

  // Forms
  "form.required": s("Required", "அவசியம்"),
  "form.optional": s("Optional", "விருப்பத்தேர்வு"),
  "form.errorRequired": s("This field is required.", "இந்தப் புலம் அவசியம்."),
  "form.loading": s("Please wait…", "காத்திருக்கவும்…"),

  // Holding page (pre-launch)
  "site.inPreparation": s("This website is being prepared.", "இந்த இணையதளம் தயாராகி வருகிறது."),

  // Special meetings
  "special.typeLabel": s("Special meeting", "சிறப்புக் கூட்டம்"),
  "special.empty": s(
    "Special meetings are announced individually.",
    "சிறப்புக் கூட்டங்கள் தனித்தனியாக அறிவிக்கப்படும்.",
  ),
} as const satisfies Record<string, UiString>;

export type UiStringKey = keyof typeof uiStrings;
export type Locale = "ta" | "en";

export function t(key: UiStringKey, locale: Locale): string {
  return uiStrings[key][locale];
}
