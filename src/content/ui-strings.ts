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

  // Accounts and sign-in (Phase 4b). Tamil is draft-review until the owner approves it.
  "auth.signIn.title": s("Sign in", "உள்நுழைக"),
  "auth.signUp.title": s("Create an account", "கணக்கை உருவாக்குக"),
  "auth.field.name": s("Full name", "முழுப் பெயர்"),
  "auth.field.email": s("Email address", "மின்னஞ்சல் முகவரி"),
  "auth.field.password": s("Password", "கடவுச்சொல்"),
  "auth.field.newPassword": s("New password", "புதிய கடவுச்சொல்"),
  "auth.passwordHint": s("At least 10 characters.", "குறைந்தது 10 எழுத்துகள்."),
  "auth.submit.signIn": s("Sign in", "உள்நுழைக"),
  "auth.submit.signUp": s("Create account", "கணக்கை உருவாக்கு"),
  "auth.google": s("Continue with Google", "Google மூலம் தொடரவும்", { note: "Shown only when Google sign-in is configured." }),
  "auth.or": s("or", "அல்லது"),
  "auth.forgot.link": s("Forgot your password?", "கடவுச்சொல்லை மறந்துவிட்டீர்களா?"),
  "auth.forgot.title": s("Reset your password", "கடவுச்சொல்லை மீட்டமைக்கவும்"),
  "auth.forgot.submit": s("Send reset link", "மீட்டமைப்பு இணைப்பை அனுப்பு"),
  "auth.forgot.sent": s(
    "If an account exists for that address, we have sent a link. It works for 1 hour.",
    "அந்த முகவரிக்கு கணக்கு இருந்தால், ஒரு இணைப்பை அனுப்பியுள்ளோம். அது 1 மணி நேரம் செல்லுபடியாகும்.",
    { note: "Same message whether or not the address is registered (prevents account discovery)." },
  ),
  "auth.signUp.sent": s(
    "Check your email. If this address can be registered, we have sent a verification link. It works for 24 hours.",
    "உங்கள் மின்னஞ்சலைப் பாருங்கள். இந்த முகவரியைப் பதிவு செய்ய முடிந்தால், சரிபார்ப்பு இணைப்பை அனுப்பியுள்ளோம். அது 24 மணி நேரம் செல்லுபடியாகும்.",
    { note: "Same message whether or not the address is already registered." },
  ),
  "auth.reset.title": s("Choose a new password", "புதிய கடவுச்சொல்லைத் தேர்ந்தெடுக்கவும்"),
  "auth.reset.submit": s("Save new password", "புதிய கடவுச்சொல்லைச் சேமி"),
  "auth.reset.done": s("Your password has been changed. Please sign in.", "உங்கள் கடவுச்சொல் மாற்றப்பட்டது. மீண்டும் உள்நுழையவும்."),
  "auth.reset.invalid": s(
    "This link is invalid or has expired. Please request a new one.",
    "இந்த இணைப்பு செல்லாதது அல்லது காலாவதியானது. புதிய இணைப்பைக் கோருங்கள்.",
  ),
  "auth.verify.title": s("Email verification", "மின்னஞ்சல் சரிபார்ப்பு"),
  "auth.verify.done": s("Your email address is verified.", "உங்கள் மின்னஞ்சல் முகவரி சரிபார்க்கப்பட்டது."),
  "auth.verify.pending": s(
    "Please verify your email address before signing in. We have sent you a new link.",
    "உள்நுழைவதற்கு முன் உங்கள் மின்னஞ்சல் முகவரியைச் சரிபார்க்கவும். புதிய இணைப்பை அனுப்பியுள்ளோம்.",
  ),
  "auth.error.invalid": s("Email or password is incorrect.", "மின்னஞ்சல் அல்லது கடவுச்சொல் தவறானது."),
  "auth.error.rateLimited": s("Too many attempts. Please try again later.", "அதிகமான முயற்சிகள். சிறிது நேரம் கழித்து மீண்டும் முயற்சிக்கவும்."),
  "auth.error.generic": s("Something went wrong. Please try again.", "ஏதோ தவறு நடந்தது. மீண்டும் முயற்சிக்கவும்."),
  "auth.error.passwordShort": s("Use at least 10 characters.", "குறைந்தது 10 எழுத்துகளைப் பயன்படுத்தவும்."),
  "auth.noAccount": s("New here? Create an account", "புதியவரா? கணக்கை உருவாக்குங்கள்"),
  "auth.haveAccount": s("Already have an account? Sign in", "ஏற்கனவே கணக்கு உள்ளதா? உள்நுழைக"),
  "account.title": s("Your account", "உங்கள் கணக்கு"),
  "account.sessions": s("Signed-in devices", "உள்நுழைந்துள்ள சாதனங்கள்"),
  "account.thisDevice": s("This device", "இந்தச் சாதனம்"),
  "account.signOut": s("Sign out", "வெளியேறு"),
  "account.signOutOthers": s("Sign out of other devices", "மற்ற சாதனங்களிலிருந்து வெளியேறு"),

  // Account emails (Phase 4b). {church} is replaced with the confirmed church name.
  "email.verify.subject": s("Verify your email address", "உங்கள் மின்னஞ்சல் முகவரியைச் சரிபார்க்கவும்"),
  "email.verify.body": s(
    "Open the link below to verify your email address. It works for 24 hours.",
    "உங்கள் மின்னஞ்சல் முகவரியைச் சரிபார்க்க கீழே உள்ள இணைப்பைத் திறக்கவும். அது 24 மணி நேரம் செல்லுபடியாகும்.",
  ),
  "email.reset.subject": s("Reset your password", "உங்கள் கடவுச்சொல்லை மீட்டமைக்கவும்"),
  "email.reset.body": s(
    "Open the link below to choose a new password. It works for 1 hour.",
    "புதிய கடவுச்சொல்லைத் தேர்ந்தெடுக்க கீழே உள்ள இணைப்பைத் திறக்கவும். அது 1 மணி நேரம் செல்லுபடியாகும்.",
  ),
  "email.ignore": s(
    "If you did not ask for this, you can ignore this email.",
    "நீங்கள் இதைக் கோரவில்லை என்றால், இந்த மின்னஞ்சலைப் புறக்கணிக்கலாம்.",
  ),
  "email.footer": s(
    "This message was sent automatically by the {church} website.",
    "இந்தச் செய்தி {church} இணையதளத்தால் தானாக அனுப்பப்பட்டது.",
  ),
} as const satisfies Record<string, UiString>;

export type UiStringKey = keyof typeof uiStrings;
export type Locale = "ta" | "en";

export function t(key: UiStringKey, locale: Locale): string {
  return uiStrings[key][locale];
}
