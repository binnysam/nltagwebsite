/**
 * Tamil content approval record — owner sign-off of 1 November 2026.
 *
 * The church owner finalised all 48 Tamil review items:
 *   - 22 items with Tamil supplied by the owner (below). These are approved content and are
 *     reproduced EXACTLY as supplied: do not rephrase, re-spell, add sandhi or "correct" them.
 *     tests/unit/tamil-review.test.ts fails if the source text differs by a single character.
 *   - the other 26 items approved as the recommended Tamil shown in the review sheet.
 *
 * `previousDraft` keeps the wording that was under review, for the audit trail only.
 * It is never rendered.
 */

export const TAMIL_APPROVAL_DATE = "2026-11-01";

export interface OwnerSuppliedTamil {
  /** English label as the owner wrote it in the approval message. */
  ownerLabel: string;
  ta: string;
  previousDraft: string;
}

export const ownerSuppliedTamil = {
  "schedule.main-worship": { ownerLabel: "Main worship service", ta: "சபை ஆராதனை", previousDraft: "பிரதான ஆராதனை" },
  "schedule.sunday-school": { ownerLabel: "Sunday school", ta: "ஞாயிறு பள்ளி", previousDraft: "சண்டே ஸ்கூல்" },
  "schedule.fasting-prayer": { ownerLabel: "Fasting prayer", ta: "உபவாச ஆராதனை", previousDraft: "உபவாச ஜெபம்" },
  "schedule.cottage-meeting": { ownerLabel: "Cottage meeting", ta: "வீட்டு ஜெபக்கூட்டம்", previousDraft: "வீட்டு ஜெபக்கூட்டம்" },
  "schedule.ladies-meeting": { ownerLabel: "Ladies meeting", ta: "ஸ்திரீகள் ஜெபக்கூட்டம்", previousDraft: "சகோதரிகள் கூட்டம்" },
  "schedule.special-meetings": { ownerLabel: "Special meeting", ta: "விசேஷ ஆராதனைகள்", previousDraft: "சிறப்புக் கூட்டங்கள்" },
  "preview.heroTitle": { ownerLabel: "New life tamil AG church", ta: "புது வாழ்வு தமிழ் AG சபை", previousDraft: "நியூ லைஃப் தமிழ் ஏ.ஜி. சபை" },
  "nav.home": { ownerLabel: "Home", ta: "முகப்பு", previousDraft: "முகப்பு" },
  "nav.about": { ownerLabel: "About", ta: "சபை வரலாறு", previousDraft: "எங்களைப் பற்றி" },
  "nav.worshipTimes": { ownerLabel: "Worship timing", ta: "ஆராதனை ஒழுங்குமுறை", previousDraft: "ஆராதனை நேரங்கள்" },
  "nav.sermons": { ownerLabel: "Sermons", ta: "தேவ செய்திகள்", previousDraft: "பிரசங்கங்கள்" },
  "nav.contact": { ownerLabel: "contact", ta: "தொடர்பு கொள்ள", previousDraft: "தொடர்பு" },
  "nav.menu": { ownerLabel: "Menu", ta: "மெனு", previousDraft: "மெனு" },
  "nav.closeMenu": { ownerLabel: "Close menu", ta: "மெனுவை மூடு", previousDraft: "மெனுவை மூடு" },
  "nav.primary": { ownerLabel: "Main navigation", ta: "முதன்மை பக்கம்", previousDraft: "முதன்மை வழிசெலுத்தல்" },
  "nav.skipToContent": { ownerLabel: "Skip to main content", ta: "முதன்மை பகுதிக்கு செல்லவும்", previousDraft: "முதன்மை உள்ளடக்கத்திற்குச் செல்லவும்" },
  "cta.joinFriday": { ownerLabel: "Join us this Friday", ta: "ஆராதனையில் இணைந்துகொள்ளுங்கள்", previousDraft: "இந்த வெள்ளிக்கிழமை எங்களுடன் இணையுங்கள்" },
  "lang.label": { ownerLabel: "Language", ta: "மொழி", previousDraft: "மொழி" },
  "hero.pause": { ownerLabel: "Pause background animation", ta: "பின்னணி அசைவை நிறுத்து", previousDraft: "பின்னணி அசைவை நிறுத்து" },
  "hero.play": { ownerLabel: "Play background animation", ta: "பின்னணி அசைவை தொடங்கு", previousDraft: "பின்னணி அசைவைத் தொடங்கு" },
  "verse.today": { ownerLabel: "Today’s verse", ta: "இன்றைய தேவ வசனம்", previousDraft: "இன்றைய வசனம்" },
  "verse.placeholderChip": { ownerLabel: "Placeholder", ta: "மாதிரி", previousDraft: "மாதிரி" },
} as const satisfies Record<string, OwnerSuppliedTamil>;

export type OwnerSuppliedId = keyof typeof ownerSuppliedTamil;

/**
 * Phase 5 public-site wording — owner sign-off of 2 November 2026 ("I approve all 15 Tamil
 * translations in PR #8"). Approved exactly as shown in PR #8 (branch head a43bedb, which
 * aligned four drafts with the owner-approved terminology). Reproduce EXACTLY; any change
 * needs new owner approval. tests/unit/tamil-review.test.ts compares every character.
 */
export const PHASE5_APPROVAL_DATE = "2026-11-02";

export const phase5ApprovedTamil = {
  "nav.ministries": "ஊழியங்கள்",
  "nav.testimonies": "சாட்சிகள்",
  "footer.nav": "இணையதள இணைப்புகள்",
  "section.announcements": "அறிவிப்புகள்",
  "section.specialMeetings": "வரவிருக்கும் விசேஷ ஆராதனைகள்",
  "section.visit": "எங்களைச் சந்திக்க வாருங்கள்",
  "section.comingSoon": "இந்தப் பகுதி விரைவில் புதுப்பிக்கப்படும்.",
  "action.viewAll": "அனைத்தையும் காண்க",
  "action.readMore": "மேலும் வாசிக்க",
  "sermon.watch": "தேவ செய்தியைப் பார்க்க",
  "testimony.anonymous": "பெயர் குறிப்பிடப்படவில்லை",
  "ministry.contact": "தொடர்பு கொள்ள",
  "special.location.tba": "இடம் பின்னர் அறிவிக்கப்படும்",
  "visit.where": "நாங்கள் கூடும் இடம்",
  "visit.when": "சபை ஆராதனை",
} as const satisfies Record<string, string>;

/**
 * Phase 4b account/email wording and Phase 6b two-factor wording — owner sign-off of 2 November 2026
 * ("I approve all 38 required Phase 4b account and email Tamil strings" and "all 45 Phase 6b two-factor
 * Tamil strings", using the recommended Tamil in the Phase 6b report for PR #10, branch head e95d6f7).
 * Approved exactly as shown. Reproduce EXACTLY; any change needs new owner approval.
 * tests/unit/tamil-review.test.ts compares every character.
 * Not approved (still draft-review): auth.google and auth.or, shown only if Google sign-in is configured.
 */
export const PHASE6_APPROVAL_DATE = "2026-11-02";

/** The 38 Phase 4b account and email strings needed before accounts open. */
export const phase4bApprovedTamil = {
  "auth.signIn.title": "உள்நுழைக",
  "auth.signUp.title": "கணக்கை உருவாக்குக",
  "auth.field.name": "முழுப் பெயர்",
  "auth.field.email": "மின்னஞ்சல் முகவரி",
  "auth.field.password": "கடவுச்சொல்",
  "auth.field.newPassword": "புதிய கடவுச்சொல்",
  "auth.passwordHint": "குறைந்தது 10 எழுத்துகள்.",
  "auth.submit.signIn": "உள்நுழைக",
  "auth.submit.signUp": "கணக்கை உருவாக்கு",
  "auth.forgot.link": "கடவுச்சொல்லை மறந்துவிட்டீர்களா?",
  "auth.forgot.title": "கடவுச்சொல்லை மீட்டமைக்கவும்",
  "auth.forgot.submit": "மீட்டமைப்பு இணைப்பை அனுப்பு",
  "auth.forgot.sent": "அந்த முகவரிக்கு கணக்கு இருந்தால், ஒரு இணைப்பை அனுப்பியுள்ளோம். அது 1 மணி நேரம் செல்லுபடியாகும்.",
  "auth.signUp.sent": "உங்கள் மின்னஞ்சலைப் பாருங்கள். இந்த முகவரியைப் பதிவு செய்ய முடிந்தால், சரிபார்ப்பு இணைப்பை அனுப்பியுள்ளோம். அது 24 மணி நேரம் செல்லுபடியாகும்.",
  "auth.reset.title": "புதிய கடவுச்சொல்லைத் தேர்ந்தெடுக்கவும்",
  "auth.reset.submit": "புதிய கடவுச்சொல்லைச் சேமி",
  "auth.reset.done": "உங்கள் கடவுச்சொல் மாற்றப்பட்டது. மீண்டும் உள்நுழையவும்.",
  "auth.reset.invalid": "இந்த இணைப்பு செல்லாதது அல்லது காலாவதியானது. புதிய இணைப்பைக் கோருங்கள்.",
  "auth.verify.title": "மின்னஞ்சல் சரிபார்ப்பு",
  "auth.verify.done": "உங்கள் மின்னஞ்சல் முகவரி சரிபார்க்கப்பட்டது.",
  "auth.verify.pending": "உள்நுழைவதற்கு முன் உங்கள் மின்னஞ்சல் முகவரியைச் சரிபார்க்கவும். புதிய இணைப்பை அனுப்பியுள்ளோம்.",
  "auth.error.invalid": "மின்னஞ்சல் அல்லது கடவுச்சொல் தவறானது.",
  "auth.error.rateLimited": "அதிகமான முயற்சிகள். சிறிது நேரம் கழித்து மீண்டும் முயற்சிக்கவும்.",
  "auth.error.generic": "ஏதோ தவறு நடந்தது. மீண்டும் முயற்சிக்கவும்.",
  "auth.error.passwordShort": "குறைந்தது 10 எழுத்துகளைப் பயன்படுத்தவும்.",
  "auth.noAccount": "புதியவரா? கணக்கை உருவாக்குங்கள்",
  "auth.haveAccount": "ஏற்கனவே கணக்கு உள்ளதா? உள்நுழைக",
  "account.title": "உங்கள் கணக்கு",
  "account.sessions": "உள்நுழைந்துள்ள சாதனங்கள்",
  "account.thisDevice": "இந்தச் சாதனம்",
  "account.signOut": "வெளியேறு",
  "account.signOutOthers": "மற்ற சாதனங்களிலிருந்து வெளியேறு",
  "email.verify.subject": "உங்கள் மின்னஞ்சல் முகவரியைச் சரிபார்க்கவும்",
  "email.verify.body": "உங்கள் மின்னஞ்சல் முகவரியைச் சரிபார்க்க கீழே உள்ள இணைப்பைத் திறக்கவும். அது 24 மணி நேரம் செல்லுபடியாகும்.",
  "email.reset.subject": "உங்கள் கடவுச்சொல்லை மீட்டமைக்கவும்",
  "email.reset.body": "புதிய கடவுச்சொல்லைத் தேர்ந்தெடுக்க கீழே உள்ள இணைப்பைத் திறக்கவும். அது 1 மணி நேரம் செல்லுபடியாகும்.",
  "email.ignore": "நீங்கள் இதைக் கோரவில்லை என்றால், இந்த மின்னஞ்சலைப் புறக்கணிக்கலாம்.",
  "email.footer": "இந்தச் செய்தி {church} இணையதளத்தால் தானாக அனுப்பப்பட்டது.",
} as const satisfies Record<string, string>;

/** The 45 Phase 6b two-factor strings. */
export const phase6bApprovedTamil = {
  "twoFactor.title": "இரு-படி உள்நுழைவு",
  "twoFactor.lead": "ஒவ்வொரு முறை உள்நுழையும்போதும், உங்கள் கைப்பேசியிலுள்ள அங்கீகரிப்புச் செயலியிலிருந்து ஒரு குறியீட்டையும் உள்ளிடுவீர்கள்.",
  "twoFactor.required": "சபை நிர்வாகிகள் நிர்வாகப் பகுதியைப் பயன்படுத்தும் முன் இரு-படி உள்நுழைவை இயக்க வேண்டும்.",
  "twoFactor.status.on": "இரு-படி உள்நுழைவு இயக்கத்தில் உள்ளது.",
  "twoFactor.status.off": "இரு-படி உள்நுழைவு இயக்கத்தில் இல்லை.",
  "twoFactor.step1": "படி 1 / 3: உங்கள் கடவுச்சொல்லை உறுதிப்படுத்தவும்",
  "twoFactor.continue": "தொடரவும்",
  "twoFactor.step2": "படி 2 / 3: உங்கள் அங்கீகரிப்புச் செயலியில் NLTAG-ஐச் சேர்க்கவும்",
  "twoFactor.step2.help": "Google Authenticator அல்லது Microsoft Authenticator போன்ற அங்கீகரிப்புச் செயலியில் இந்த QR குறியீட்டை ஸ்கேன் செய்யவும். ஸ்கேன் செய்ய முடியவில்லை என்றால், அமைப்பு விசையைச் செயலியில் தட்டச்சு செய்யவும்.",
  "twoFactor.qr.label": "அங்கீகரிப்புச் செயலியில் NLTAG-ஐச் சேர்க்கும் QR குறியீடு",
  "twoFactor.setupKey": "அமைப்பு விசை",
  "twoFactor.step3": "படி 3 / 3: உங்கள் மீட்புக் குறியீடுகளைச் சேமித்து உறுதிப்படுத்தவும்",
  "twoFactor.recovery.help": "உங்கள் கைப்பேசி தொலைந்தால், இந்தக் குறியீடுகள் ஒவ்வொன்றையும் கொண்டு ஒருமுறை உள்நுழையலாம். இவற்றை அச்சிடவும் அல்லது பாதுகாப்பான இடத்தில் வைக்கவும். இவை இப்போது மட்டுமே காட்டப்படும்.",
  "twoFactor.recovery.listLabel": "உங்கள் மீட்புக் குறியீடுகள்",
  "twoFactor.recovery.download": "குறியீடுகளை உரைக் கோப்பாகப் பதிவிறக்கு",
  "twoFactor.recovery.saved": "என் மீட்புக் குறியீடுகளைப் பாதுகாப்பான இடத்தில் சேமித்துவிட்டேன்.",
  "twoFactor.recovery.savedRequired": "உங்கள் மீட்புக் குறியீடுகளைச் சேமித்ததை உறுதிப்படுத்தவும்.",
  "twoFactor.field.code": "செயலியிலுள்ள 6 இலக்கக் குறியீடு",
  "twoFactor.confirm.submit": "இரு-படி உள்நுழைவை இயக்கு",
  "twoFactor.enabled.done": "இரு-படி உள்நுழைவு இப்போது இயக்கத்தில் உள்ளது. உங்கள் மற்ற சாதனங்களிலிருந்து வெளியேற்றப்பட்டுள்ளீர்கள்.",
  "twoFactor.recovery.title": "மீட்புக் குறியீடுகள்",
  "twoFactor.recovery.remaining": "பயன்படுத்தப்படாத மீட்புக் குறியீடுகள்: 10-இல் {n}.",
  "twoFactor.regenerate.help": "புதிய குறியீடுகளை உருவாக்கினால், உங்கள் பழைய மீட்புக் குறியீடுகள் அனைத்தும் செயலிழக்கும். உங்கள் கடவுச்சொல்லையும் செயலியிலுள்ள தற்போதைய குறியீட்டையும் உள்ளிடவும்.",
  "twoFactor.regenerate.submit": "புதிய மீட்புக் குறியீடுகளை உருவாக்கு",
  "twoFactor.regenerate.done": "புதிய மீட்புக் குறியீடுகள் தயார். உங்கள் பழைய குறியீடுகள் இனி செயல்படாது.",
  "twoFactor.disable.title": "இரு-படி உள்நுழைவை நிறுத்து",
  "twoFactor.disable.help": "கைப்பேசியை மாற்றும்போது இதைப் பயன்படுத்தவும்: இதை நிறுத்தி, புதிய கைப்பேசியில் மீண்டும் அமைக்கவும். இது நிறுத்தப்பட்டிருக்கும்போது சபை நிர்வாகி நிர்வாகப் பகுதியைப் பயன்படுத்த முடியாது.",
  "twoFactor.disable.submit": "இரு-படி உள்நுழைவை நிறுத்து",
  "twoFactor.disable.done": "இரு-படி உள்நுழைவு நிறுத்தப்பட்டது.",
  "twoFactor.field.currentCode": "செயலியிலுள்ள குறியீடு அல்லது ஒரு மீட்புக் குறியீடு",
  "twoFactor.challenge.title": "உங்கள் உள்நுழைவுக் குறியீட்டை உள்ளிடவும்",
  "twoFactor.challenge.lead": "உங்கள் அங்கீகரிப்புச் செயலியைத் திறந்து, NLTAG-க்குக் காட்டப்படும் 6 இலக்கக் குறியீட்டை உள்ளிடவும்.",
  "twoFactor.field.recoveryCode": "மீட்புக் குறியீடு",
  "twoFactor.recovery.hint": "ஒவ்வொரு மீட்புக் குறியீடும் ஒருமுறை மட்டுமே செயல்படும்.",
  "twoFactor.useRecovery": "அதற்குப் பதிலாக மீட்புக் குறியீட்டைப் பயன்படுத்து",
  "twoFactor.useApp": "அதற்குப் பதிலாக அங்கீகரிப்புச் செயலியைப் பயன்படுத்து",
  "twoFactor.verify": "சரிபார்",
  "twoFactor.error.code": "அந்தக் குறியீடு சரியானதல்ல. சரிபார்த்து மீண்டும் முயற்சிக்கவும்.",
  "twoFactor.error.expired": "இந்த உள்நுழைவு காலாவதியானது அல்லது அதிக முயற்சிகள் செய்யப்பட்டன. மீண்டும் உள்நுழையவும்.",
  "twoFactor.error.locked": "பல தவறான குறியீடுகள். 15 நிமிடங்கள் காத்திருந்து மீண்டும் முயற்சிக்கவும்.",
  "twoFactor.error.password": "கடவுச்சொல் சரியானதல்ல.",
  "twoFactor.error.fresh": "உங்கள் பாதுகாப்பிற்காக, இரு-படி உள்நுழைவை மாற்றும் முன் வெளியேறி மீண்டும் உள்நுழையவும்.",
  "account.twoFactor.setUp": "இரு-படி உள்நுழைவை அமைக்கவும்",
  "account.twoFactor.manage": "இரு-படி உள்நுழைவை நிர்வகிக்கவும்",
  "account.back": "உங்கள் கணக்குக்குத் திரும்பு",
} as const satisfies Record<string, string>;

/** Interface strings confirmed at Gate 0, before the Tamil review. Not part of the 48. */
export const gate0ConfirmedTamil = ["lang.ta", "lang.en"] as const;
