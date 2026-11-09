/**
 * NLTAG interface strings (UI chrome only — never church facts).
 *
 * Review status:
 *   - "confirmed"     → approved by the church/owner (Gate 0 or later).
 *   - "proposed"      → English interface wording written by the project team; owner may edit.
 *   - "draft-review"  → Tamil wording awaiting church review. Must not go live on a public
 *                        page until changed to "confirmed". New strings start here.
 *
 * The reviewed Tamil was approved by the owner on 1 Nov 2026; the Phase 5 public-site wording and the
 * Phase 4b account/email and Phase 6b two-factor wording on 2 Nov 2026 (src/content/tamil-approvals.ts).
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

/** Tamil approved by the owner (1 Nov 2026; Phase 5, 4b and 6b wording 2 Nov 2026). Use `s()` for any new string. */
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

  // Public website (Phase 5, 2 Nov 2026). Tamil approved by the owner on 2 Nov 2026 (phase5ApprovedTamil).
  "nav.ministries": c("Ministries", "ஊழியங்கள்"),
  "nav.testimonies": c("Testimonies", "சாட்சிகள்"),
  "footer.nav": c("Site links", "இணையதள இணைப்புகள்"),
  "section.announcements": c("Announcements", "அறிவிப்புகள்"),
  "section.specialMeetings": c("Upcoming special meetings", "வரவிருக்கும் விசேஷ ஆராதனைகள்", {
    note: "Uses the owner-approved name விசேஷ ஆராதனைகள் (schedule.special-meetings). Previous draft: வரவிருக்கும் சிறப்புக் கூட்டங்கள்.",
  }),
  "section.visit": c("Visit us", "எங்களைச் சந்திக்க வாருங்கள்"),
  "section.comingSoon": c(
    "This section will be updated soon.",
    "இந்தப் பகுதி விரைவில் புதுப்பிக்கப்படும்.",
    { note: "Shown wherever the church has not published content for a section yet." },
  ),
  "action.viewAll": c("View all", "அனைத்தையும் காண்க"),
  "action.readMore": c("Read more", "மேலும் வாசிக்க"),
  "sermon.watch": c("Watch the sermon", "தேவ செய்தியைப் பார்க்க", {
    note: "Uses the owner-approved term தேவ செய்தி (nav.sermons); bare செய்தி also means news. Previous draft: செய்தியைப் பார்க்க.",
  }),
  "testimony.anonymous": c("Name withheld", "பெயர் குறிப்பிடப்படவில்லை"),
  "ministry.contact": c("Contact", "தொடர்பு கொள்ள", {
    note: "Same wording as the owner-approved nav.contact. Previous draft: தொடர்புக்கு.",
  }),
  "special.location.tba": c("Venue to be announced", "இடம் பின்னர் அறிவிக்கப்படும்"),
  "visit.where": c("Where we meet", "நாங்கள் கூடும் இடம்"),
  "visit.when": c("Main worship", "சபை ஆராதனை", {
    note: "Exactly the owner-approved name of the main worship service (schedule.main-worship). Previous draft: சபை ஆராதனை நேரம்.",
  }),

  // Website completion, Phase A (Nov 2026). English proposed; Tamil draft-review. The Phase A PR must
  // not be merged (merge = deploy) until the owner approves these.
  "notFound.title": s("Page not found", "பக்கம் கிடைக்கவில்லை", { note: "Heading of the 404 page." }),
  "notFound.body": s(
    "This page does not exist or is not published yet.",
    "இந்தப் பக்கம் இல்லை, அல்லது இன்னும் வெளியிடப்படவில்லை.",
    { note: "404 page, under the heading. Followed by links to the home page and the site links." },
  ),
  "share.copied": s("Link copied", "இணைப்பு நகலெடுக்கப்பட்டது", {
    note: "Shown after the Share button (approved verse.share) copies the page link, on browsers without a share sheet.",
  }),
  "sermon.search": s("Search sermons", "தேவ செய்திகளைத் தேடுக", {
    note: "Search box label on the Sermons page. Uses the approved term தேவ செய்தி (nav.sermons).",
  }),
  "sermon.speaker": s("Speaker", "பிரசங்கியார்", { note: "Filter label: who preached the sermon." }),
  "filter.allSpeakers": s("All speakers", "அனைத்து பிரசங்கியார்களும்", { note: "First option of the speaker filter." }),
  "filter.submit": s("Search", "தேடு", { note: "Button that applies the sermon search and filter." }),
  "filter.clear": s("Clear search", "தேடலை நீக்கு", { note: "Link that removes the search and filter." }),
  "filter.noResults": s("Nothing matches your search.", "உங்கள் தேடலுக்குப் பொருந்தும் எதுவும் இல்லை."),
  "pagination.label": s("Pages", "பக்கங்கள்", { note: "Screen-reader name of the page links below a list." }),
  "pagination.previous": s("Previous page", "முந்தைய பக்கம்"),
  "pagination.next": s("Next page", "அடுத்த பக்கம்"),
  "pagination.status": s("Page {page} of {total}", "பக்கம் {page} / {total}", {
    note: "{page} and {total} are numbers, e.g. Page 2 of 5.",
  }),

  // Accounts and sign-in (Phase 4b). Tamil approved by the owner on 2 Nov 2026 (phase4bApprovedTamil),
  // except auth.google and auth.or (draft-review; shown only if Google sign-in is configured).
  "auth.signIn.title": c("Sign in", "உள்நுழைக"),
  "auth.signUp.title": c("Create an account", "கணக்கை உருவாக்குக"),
  "auth.field.name": c("Full name", "முழுப் பெயர்"),
  "auth.field.email": c("Email address", "மின்னஞ்சல் முகவரி"),
  "auth.field.password": c("Password", "கடவுச்சொல்"),
  "auth.field.newPassword": c("New password", "புதிய கடவுச்சொல்"),
  "auth.passwordHint": c("At least 10 characters.", "குறைந்தது 10 எழுத்துகள்."),
  "auth.submit.signIn": c("Sign in", "உள்நுழைக"),
  "auth.submit.signUp": c("Create account", "கணக்கை உருவாக்கு"),
  "auth.google": s("Continue with Google", "Google மூலம் தொடரவும்", { note: "Shown only when Google sign-in is configured." }),
  "auth.or": s("or", "அல்லது"),
  "auth.forgot.link": c("Forgot your password?", "கடவுச்சொல்லை மறந்துவிட்டீர்களா?"),
  "auth.forgot.title": c("Reset your password", "கடவுச்சொல்லை மீட்டமைக்கவும்"),
  "auth.forgot.submit": c("Send reset link", "மீட்டமைப்பு இணைப்பை அனுப்பு"),
  "auth.forgot.sent": c(
    "If an account exists for that address, we have sent a link. It works for 1 hour.",
    "அந்த முகவரிக்கு கணக்கு இருந்தால், ஒரு இணைப்பை அனுப்பியுள்ளோம். அது 1 மணி நேரம் செல்லுபடியாகும்.",
    { note: "Same message whether or not the address is registered (prevents account discovery)." },
  ),
  "auth.signUp.sent": c(
    "Check your email. If this address can be registered, we have sent a verification link. It works for 24 hours.",
    "உங்கள் மின்னஞ்சலைப் பாருங்கள். இந்த முகவரியைப் பதிவு செய்ய முடிந்தால், சரிபார்ப்பு இணைப்பை அனுப்பியுள்ளோம். அது 24 மணி நேரம் செல்லுபடியாகும்.",
    { note: "Same message whether or not the address is already registered." },
  ),
  "auth.reset.title": c("Choose a new password", "புதிய கடவுச்சொல்லைத் தேர்ந்தெடுக்கவும்"),
  "auth.reset.submit": c("Save new password", "புதிய கடவுச்சொல்லைச் சேமி"),
  "auth.reset.done": c("Your password has been changed. Please sign in.", "உங்கள் கடவுச்சொல் மாற்றப்பட்டது. மீண்டும் உள்நுழையவும்."),
  "auth.reset.invalid": c(
    "This link is invalid or has expired. Please request a new one.",
    "இந்த இணைப்பு செல்லாதது அல்லது காலாவதியானது. புதிய இணைப்பைக் கோருங்கள்.",
  ),
  // R4 mailbox-first registration (D1, D9; Nov 2026). English proposed; Tamil draft-review, owner
  // approval (gate G-D) before the first Church Admin activation.
  "auth.accountRequest.hint": s(
    "We will email you a link to choose your password.",
    "உங்கள் கடவுச்சொல்லைத் தேர்ந்தெடுக்க ஒரு இணைப்பை மின்னஞ்சலில் அனுப்புவோம்.",
    { note: "R4 D1. Shown on the create-account form, which now asks only for an email address." },
  ),
  "auth.accountRequest.sent": s(
    "Check your email. If this address can be registered, we have sent a link to choose your password. It works for 1 hour.",
    "உங்கள் மின்னஞ்சலைப் பாருங்கள். இந்த முகவரியைப் பதிவு செய்ய முடிந்தால், உங்கள் கடவுச்சொல்லைத் தேர்ந்தெடுக்க ஒரு இணைப்பை அனுப்பியுள்ளோம். அது 1 மணி நேரம் செல்லுபடியாகும்.",
    { note: "R4 D1. Same message for every address (prevents account discovery). Replaces auth.signUp.sent on the form." },
  ),
  "auth.accountRequest.retry": s(
    "The email may take a few minutes to arrive. If nothing arrives within 10 minutes, please request again.",
    "மின்னஞ்சல் வர சில நிமிடங்கள் ஆகலாம். 10 நிமிடங்களுக்குள் எதுவும் வரவில்லை என்றால், மீண்டும் கோருங்கள்.",
    { note: "R4 v6.1 §2.6 retry guidance, shown with auth.accountRequest.sent." },
  ),
  "auth.setPassword.title": s("Choose your password", "உங்கள் கடவுச்சொல்லைத் தேர்ந்தெடுக்கவும்", {
    note: "R4 D9. Page reached from the set-password email.",
  }),
  "auth.setPassword.submit": s("Save password", "கடவுச்சொல்லைச் சேமி", { note: "R4 D9." }),
  "auth.setPassword.done": s("Your password is set. Please sign in.", "உங்கள் கடவுச்சொல் அமைக்கப்பட்டது. உள்நுழையவும்.", { note: "R4 D9." }),
  "auth.verify.title": c("Email verification", "மின்னஞ்சல் சரிபார்ப்பு"),
  "auth.verify.done": c("Your email address is verified.", "உங்கள் மின்னஞ்சல் முகவரி சரிபார்க்கப்பட்டது."),
  "auth.verify.pending": c(
    "Please verify your email address before signing in. We have sent you a new link.",
    "உள்நுழைவதற்கு முன் உங்கள் மின்னஞ்சல் முகவரியைச் சரிபார்க்கவும். புதிய இணைப்பை அனுப்பியுள்ளோம்.",
  ),
  "auth.error.invalid": c("Email or password is incorrect.", "மின்னஞ்சல் அல்லது கடவுச்சொல் தவறானது."),
  "auth.error.rateLimited": c("Too many attempts. Please try again later.", "அதிகமான முயற்சிகள். சிறிது நேரம் கழித்து மீண்டும் முயற்சிக்கவும்."),
  "auth.error.generic": c("Something went wrong. Please try again.", "ஏதோ தவறு நடந்தது. மீண்டும் முயற்சிக்கவும்."),
  "auth.error.passwordShort": c("Use at least 10 characters.", "குறைந்தது 10 எழுத்துகளைப் பயன்படுத்தவும்."),
  "auth.noAccount": c("New here? Create an account", "புதியவரா? கணக்கை உருவாக்குங்கள்"),
  "auth.haveAccount": c("Already have an account? Sign in", "ஏற்கனவே கணக்கு உள்ளதா? உள்நுழைக"),
  "account.title": c("Your account", "உங்கள் கணக்கு"),
  "account.sessions": c("Signed-in devices", "உள்நுழைந்துள்ள சாதனங்கள்"),
  "account.thisDevice": c("This device", "இந்தச் சாதனம்"),
  "account.signOut": c("Sign out", "வெளியேறு"),
  "account.signOutOthers": c("Sign out of other devices", "மற்ற சாதனங்களிலிருந்து வெளியேறு"),

  // Two-factor sign-in (Phase 6b). Tamil approved by the owner on 2 Nov 2026 (phase6bApprovedTamil).
  // Terms: "two-factor sign-in" = இரு-படி உள்நுழைவு; "authenticator app" = அங்கீகரிப்புச் செயலி.
  "twoFactor.title": c("Two-factor sign-in", "இரு-படி உள்நுழைவு", {
    note: "Name of the feature on every two-factor screen. Other possible wording: இரு காரணி உள்நுழைவு, இரண்டு-படி சரிபார்ப்பு.",
  }),
  "twoFactor.lead": c(
    "Each time you sign in, you also enter a code from an authenticator app on your phone.",
    "ஒவ்வொரு முறை உள்நுழையும்போதும், உங்கள் கைப்பேசியிலுள்ள அங்கீகரிப்புச் செயலியிலிருந்து ஒரு குறியீட்டையும் உள்ளிடுவீர்கள்.",
    { note: "அங்கீகரிப்புச் செயலி = authenticator app (other possible wording: Authenticator செயலி). App names stay in English." },
  ),
  "twoFactor.required": c(
    "Church Admins must turn on two-factor sign-in before they can use the admin.",
    "சபை நிர்வாகிகள் நிர்வாகப் பகுதியைப் பயன்படுத்தும் முன் இரு-படி உள்நுழைவை இயக்க வேண்டும்.",
  ),
  "twoFactor.status.on": c("Two-factor sign-in is on.", "இரு-படி உள்நுழைவு இயக்கத்தில் உள்ளது."),
  "twoFactor.status.off": c("Two-factor sign-in is off.", "இரு-படி உள்நுழைவு இயக்கத்தில் இல்லை."),
  "twoFactor.step1": c("Step 1 of 3: Confirm your password", "படி 1 / 3: உங்கள் கடவுச்சொல்லை உறுதிப்படுத்தவும்"),
  "twoFactor.continue": c("Continue", "தொடரவும்"),
  "twoFactor.step2": c("Step 2 of 3: Add NLTAG to your authenticator app", "படி 2 / 3: உங்கள் அங்கீகரிப்புச் செயலியில் NLTAG-ஐச் சேர்க்கவும்"),
  "twoFactor.step2.help": c(
    "Scan the QR code with an authenticator app, such as Google Authenticator or Microsoft Authenticator. If you cannot scan it, type the setup key into the app instead.",
    "Google Authenticator அல்லது Microsoft Authenticator போன்ற அங்கீகரிப்புச் செயலியில் இந்த QR குறியீட்டை ஸ்கேன் செய்யவும். ஸ்கேன் செய்ய முடியவில்லை என்றால், அமைப்பு விசையைச் செயலியில் தட்டச்சு செய்யவும்.",
  ),
  "twoFactor.qr.label": c("QR code that adds NLTAG to an authenticator app", "அங்கீகரிப்புச் செயலியில் NLTAG-ஐச் சேர்க்கும் QR குறியீடு"),
  "twoFactor.setupKey": c("Setup key", "அமைப்பு விசை"),
  "twoFactor.step3": c("Step 3 of 3: Save your recovery codes and confirm", "படி 3 / 3: உங்கள் மீட்புக் குறியீடுகளைச் சேமித்து உறுதிப்படுத்தவும்"),
  "twoFactor.recovery.help": c(
    "If you lose your phone, each of these codes lets you sign in once. Print them or keep them somewhere safe. They are shown only now.",
    "உங்கள் கைப்பேசி தொலைந்தால், இந்தக் குறியீடுகள் ஒவ்வொன்றையும் கொண்டு ஒருமுறை உள்நுழையலாம். இவற்றை அச்சிடவும் அல்லது பாதுகாப்பான இடத்தில் வைக்கவும். இவை இப்போது மட்டுமே காட்டப்படும்.",
  ),
  "twoFactor.recovery.listLabel": c("Your recovery codes", "உங்கள் மீட்புக் குறியீடுகள்"),
  "twoFactor.recovery.download": c("Download the codes as a text file", "குறியீடுகளை உரைக் கோப்பாகப் பதிவிறக்கு"),
  "twoFactor.recovery.saved": c("I have saved my recovery codes in a safe place.", "என் மீட்புக் குறியீடுகளைப் பாதுகாப்பான இடத்தில் சேமித்துவிட்டேன்."),
  "twoFactor.recovery.savedRequired": c("Please confirm that you have saved your recovery codes.", "உங்கள் மீட்புக் குறியீடுகளைச் சேமித்ததை உறுதிப்படுத்தவும்."),
  "twoFactor.field.code": c("6-digit code from the app", "செயலியிலுள்ள 6 இலக்கக் குறியீடு"),
  "twoFactor.confirm.submit": c("Turn on two-factor sign-in", "இரு-படி உள்நுழைவை இயக்கு"),
  "twoFactor.enabled.done": c(
    "Two-factor sign-in is now on. You have been signed out of your other devices.",
    "இரு-படி உள்நுழைவு இப்போது இயக்கத்தில் உள்ளது. உங்கள் மற்ற சாதனங்களிலிருந்து வெளியேற்றப்பட்டுள்ளீர்கள்.",
  ),
  "twoFactor.recovery.title": c("Recovery codes", "மீட்புக் குறியீடுகள்"),
  "twoFactor.recovery.remaining": c("Unused recovery codes: {n} of 10.", "பயன்படுத்தப்படாத மீட்புக் குறியீடுகள்: 10-இல் {n}.", {
    note: "{n} is replaced with a number.",
  }),
  "twoFactor.regenerate.help": c(
    "Making new codes stops all your old recovery codes from working. Enter your password and a current code from the app.",
    "புதிய குறியீடுகளை உருவாக்கினால், உங்கள் பழைய மீட்புக் குறியீடுகள் அனைத்தும் செயலிழக்கும். உங்கள் கடவுச்சொல்லையும் செயலியிலுள்ள தற்போதைய குறியீட்டையும் உள்ளிடவும்.",
  ),
  "twoFactor.regenerate.submit": c("Make new recovery codes", "புதிய மீட்புக் குறியீடுகளை உருவாக்கு"),
  "twoFactor.regenerate.done": c("New recovery codes are ready. Your old codes no longer work.", "புதிய மீட்புக் குறியீடுகள் தயார். உங்கள் பழைய குறியீடுகள் இனி செயல்படாது."),
  "twoFactor.disable.title": c("Turn off two-factor sign-in", "இரு-படி உள்நுழைவை நிறுத்து"),
  "twoFactor.disable.help": c(
    "Use this when you replace your phone: turn it off, then set it up again on the new phone. While it is off, a Church Admin cannot use the admin.",
    "கைப்பேசியை மாற்றும்போது இதைப் பயன்படுத்தவும்: இதை நிறுத்தி, புதிய கைப்பேசியில் மீண்டும் அமைக்கவும். இது நிறுத்தப்பட்டிருக்கும்போது சபை நிர்வாகி நிர்வாகப் பகுதியைப் பயன்படுத்த முடியாது.",
  ),
  "twoFactor.disable.submit": c("Turn off two-factor sign-in", "இரு-படி உள்நுழைவை நிறுத்து"),
  "twoFactor.disable.done": c("Two-factor sign-in is off.", "இரு-படி உள்நுழைவு நிறுத்தப்பட்டது."),
  "twoFactor.field.currentCode": c("Code from the app, or a recovery code", "செயலியிலுள்ள குறியீடு அல்லது ஒரு மீட்புக் குறியீடு"),
  "twoFactor.challenge.title": c("Enter your sign-in code", "உங்கள் உள்நுழைவுக் குறியீட்டை உள்ளிடவும்"),
  "twoFactor.challenge.lead": c(
    "Open your authenticator app and enter the 6-digit code shown for NLTAG.",
    "உங்கள் அங்கீகரிப்புச் செயலியைத் திறந்து, NLTAG-க்குக் காட்டப்படும் 6 இலக்கக் குறியீட்டை உள்ளிடவும்.",
  ),
  "twoFactor.field.recoveryCode": c("Recovery code", "மீட்புக் குறியீடு"),
  "twoFactor.recovery.hint": c("Each recovery code works only once.", "ஒவ்வொரு மீட்புக் குறியீடும் ஒருமுறை மட்டுமே செயல்படும்."),
  "twoFactor.useRecovery": c("Use a recovery code instead", "அதற்குப் பதிலாக மீட்புக் குறியீட்டைப் பயன்படுத்து"),
  "twoFactor.useApp": c("Use the authenticator app instead", "அதற்குப் பதிலாக அங்கீகரிப்புச் செயலியைப் பயன்படுத்து"),
  "twoFactor.verify": c("Verify", "சரிபார்"),
  "twoFactor.error.code": c("That code is not correct. Check it and try again.", "அந்தக் குறியீடு சரியானதல்ல. சரிபார்த்து மீண்டும் முயற்சிக்கவும்."),
  "twoFactor.error.expired": c(
    "This sign-in has expired or had too many attempts. Please sign in again.",
    "இந்த உள்நுழைவு காலாவதியானது அல்லது அதிக முயற்சிகள் செய்யப்பட்டன. மீண்டும் உள்நுழையவும்.",
  ),
  "twoFactor.error.locked": c(
    "Too many incorrect codes. Please wait 15 minutes and try again.",
    "பல தவறான குறியீடுகள். 15 நிமிடங்கள் காத்திருந்து மீண்டும் முயற்சிக்கவும்.",
  ),
  "twoFactor.error.password": c("The password is not correct.", "கடவுச்சொல் சரியானதல்ல."),
  "twoFactor.error.fresh": c(
    "For your safety, sign out and sign in again before changing two-factor sign-in.",
    "உங்கள் பாதுகாப்பிற்காக, இரு-படி உள்நுழைவை மாற்றும் முன் வெளியேறி மீண்டும் உள்நுழையவும்.",
  ),
  "account.twoFactor.setUp": c("Set up two-factor sign-in", "இரு-படி உள்நுழைவை அமைக்கவும்"),
  "account.twoFactor.manage": c("Manage two-factor sign-in", "இரு-படி உள்நுழைவை நிர்வகிக்கவும்"),
  "account.back": c("Back to your account", "உங்கள் கணக்குக்குத் திரும்பு"),

  // Account emails (Phase 4b). {church} is replaced with the confirmed church name. Tamil approved 2 Nov 2026.
  "email.verify.subject": c("Verify your email address", "உங்கள் மின்னஞ்சல் முகவரியைச் சரிபார்க்கவும்"),
  "email.verify.body": c(
    "Open the link below to verify your email address. It works for 24 hours.",
    "உங்கள் மின்னஞ்சல் முகவரியைச் சரிபார்க்க கீழே உள்ள இணைப்பைத் திறக்கவும். அது 24 மணி நேரம் செல்லுபடியாகும்.",
  ),
  "email.reset.subject": c("Reset your password", "உங்கள் கடவுச்சொல்லை மீட்டமைக்கவும்"),
  "email.reset.body": c(
    "Open the link below to choose a new password. It works for 1 hour.",
    "புதிய கடவுச்சொல்லைத் தேர்ந்தெடுக்க கீழே உள்ள இணைப்பைத் திறக்கவும். அது 1 மணி நேரம் செல்லுபடியாகும்.",
  ),
  // R4 D9 (Nov 2026): the first-password email of mailbox-first registration. English proposed;
  // Tamil is a draft for owner review (draft-review) and must be approved (gate G-D) before the
  // first Church Admin is activated. Reuses the approved phrasing of email.reset.body where it can.
  "email.setPassword.subject": s("Set your password", "உங்கள் கடவுச்சொல்லை அமைக்கவும்", {
    note: "R4 D9. Sent when an account is requested for a listed address that has no password yet.",
  }),
  "email.setPassword.body": s(
    "An account has been requested for this email address. Open the link below to choose your password. It works for 1 hour.",
    "இந்த மின்னஞ்சல் முகவரிக்கு ஒரு கணக்கு கோரப்பட்டுள்ளது. உங்கள் கடவுச்சொல்லைத் தேர்ந்தெடுக்க கீழே உள்ள இணைப்பைத் திறக்கவும். அது 1 மணி நேரம் செல்லுபடியாகும்.",
    { note: "R4 D9. The second and third sentences reuse the approved wording of email.reset.body." },
  ),
  "email.ignore": c(
    "If you did not ask for this, you can ignore this email.",
    "நீங்கள் இதைக் கோரவில்லை என்றால், இந்த மின்னஞ்சலைப் புறக்கணிக்கலாம்.",
  ),
  "email.footer": c(
    "This message was sent automatically by the {church} website.",
    "இந்தச் செய்தி {church} இணையதளத்தால் தானாக அனுப்பப்பட்டது.",
  ),

  // Sign-in protection alert (M1 security fix, Nov 2026). English proposed; Tamil is a draft for
  // owner review. Until the Tamil is confirmed the alert is sent in English only (templates.ts).
  "email.signInThrottled.subject": s(
    "Repeated wrong sign-in attempts on your account",
    "உங்கள் கணக்கில் பலமுறை தவறான உள்நுழைவு முயற்சிகள்",
  ),
  "email.signInThrottled.body": s(
    "Someone has tried several times to sign in to your account with a wrong password, so sign-in attempts from browsers you have not used before are being slowed down for a while. You can still sign in from a browser you have signed in with before. Your password and, for Church Admins, your authenticator code are still required. If this was not you, consider changing your password after you sign in.",
    "யாரோ தவறான கடவுச்சொல்லுடன் உங்கள் கணக்கில் பலமுறை உள்நுழைய முயன்றுள்ளனர். அதனால், நீங்கள் இதுவரை பயன்படுத்தாத உலாவிகளிலிருந்து வரும் உள்நுழைவு முயற்சிகள் சிறிது நேரம் மெதுவாக்கப்பட்டுள்ளன. நீங்கள் முன்பு உள்நுழைந்த உலாவியிலிருந்து இன்னும் உள்நுழையலாம். உங்கள் கடவுச்சொல்லும், சபை நிர்வாகிகளுக்கு அங்கீகரிப்புச் செயலியின் குறியீடும் தொடர்ந்து தேவைப்படும். இது நீங்கள் இல்லையென்றால், உள்நுழைந்த பின் உங்கள் கடவுச்சொல்லை மாற்றுவதைக் கருத்தில் கொள்ளுங்கள்.",
  ),

} as const satisfies Record<string, UiString>;

export type UiStringKey = keyof typeof uiStrings;
export type Locale = "ta" | "en";

export function t(key: UiStringKey, locale: Locale): string {
  return uiStrings[key][locale];
}
