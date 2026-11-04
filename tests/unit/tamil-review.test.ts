// @vitest-environment node
import { readFileSync } from "node:fs";
import { buildTamilReview, reviewItems, REVIEW_SHEET } from "../../scripts/tamil-review.ts";
import { uiStrings } from "@/content/ui-strings";
import { schedule } from "@/content/schedule";
import {
  ownerSuppliedTamil,
  gate0ConfirmedTamil,
  phase5ApprovedTamil,
  phase4bApprovedTamil,
  phase6bApprovedTamil,
  r4D9ApprovedTamil,
} from "@/content/tamil-approvals";

/**
 * Owner sign-off of 1 Nov 2026. The 22 owner-supplied strings are written out again here,
 * character for character, so a change in either place fails the test. Never "fix" them.
 */
const OWNER_SUPPLIED: Record<string, string> = {
  "schedule.main-worship": "சபை ஆராதனை",
  "schedule.sunday-school": "ஞாயிறு பள்ளி",
  "schedule.fasting-prayer": "உபவாச ஆராதனை",
  "schedule.cottage-meeting": "வீட்டு ஜெபக்கூட்டம்",
  "schedule.ladies-meeting": "ஸ்திரீகள் ஜெபக்கூட்டம்",
  "schedule.special-meetings": "விசேஷ ஆராதனைகள்",
  "preview.heroTitle": "புது வாழ்வு தமிழ் AG சபை",
  "nav.home": "முகப்பு",
  "nav.about": "சபை வரலாறு",
  "nav.worshipTimes": "ஆராதனை ஒழுங்குமுறை",
  "nav.sermons": "தேவ செய்திகள்",
  "nav.contact": "தொடர்பு கொள்ள",
  "nav.menu": "மெனு",
  "nav.closeMenu": "மெனுவை மூடு",
  "nav.primary": "முதன்மை பக்கம்",
  "nav.skipToContent": "முதன்மை பகுதிக்கு செல்லவும்",
  "cta.joinFriday": "ஆராதனையில் இணைந்துகொள்ளுங்கள்",
  "lang.label": "மொழி",
  "hero.pause": "பின்னணி அசைவை நிறுத்து",
  "hero.play": "பின்னணி அசைவை தொடங்கு",
  "verse.today": "இன்றைய தேவ வசனம்",
  "verse.placeholderChip": "மாதிரி",
};

/**
 * Phase 5 public-site wording, approved by the owner on 2 Nov 2026 exactly as shown in PR #8.
 * Written out again here, character for character, so a change in either place fails the test.
 */
const PHASE5_APPROVED: Record<string, string> = {
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
};

/**
 * Phase 4b account/email (38) and Phase 6b two-factor (45) wording, approved by the owner on 2 Nov 2026
 * exactly as shown in the Phase 6b report for PR #10. Written out again here, character for character,
 * so a change in either place fails the test.
 */
const PHASE4B_APPROVED: Record<string, string> = {
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
};

const PHASE6B_APPROVED: Record<string, string> = {
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
};

/** Still awaiting owner review: shown only when Google sign-in is configured (it is not). */
// Awaiting owner review: Google sign-in (shown only if configured) and the sign-in throttle alert
// email (PR #11 follow-up, Nov 2026; sent in English only until its Tamil is confirmed).
const PENDING = [
  "auth.google",
  "auth.or",
  "email.signInThrottled.subject",
  "email.signInThrottled.body",
];

/** The 26 recommended drafts the owner approved unchanged ("rest all is fine"). */
const APPROVED_AS_RECOMMENDED: [string, string][] = [
  ["time.evening", "மாலை"],
  ["time.morning", "காலை"],
  ["verse.placeholderText", "மறுபதிப்பு அனுமதி உறுதியானதும் வசனம் இங்கே இடம்பெறும்."],
  ["verse.placeholderReference", "வசனக் குறிப்பு"],
  ["verse.publisherCredit", "வெளியீட்டாளர் நன்றிக் குறிப்பு தேவை"],
  ["verse.share", "பகிர்"],
  ["verse.download", "PNG பதிவிறக்கு"],
  ["verse.fallback", "இன்றைய வசனம் விரைவில் வெளியிடப்படும்."],
  ["schedule.heading", "ஆராதனை அட்டவணை"],
  ["schedule.col.name", "கூடுகை"],
  ["schedule.col.when", "நேரம்"],
  ["schedule.col.where", "இடம்"],
  ["schedule.timezone", "அனைத்து நேரங்களும் குவைத் நேரம்."],
  ["status.draft", "வரைவு"],
  ["status.emailVerified", "மின்னஞ்சல் சரிபார்க்கப்பட்டது"],
  ["status.pendingReview", "பரிசீலனையில்"],
  ["status.correctionRequested", "திருத்தம் கோரப்பட்டுள்ளது"],
  ["status.active", "செயலில்"],
  ["status.rejected", "நிராகரிக்கப்பட்டது"],
  ["form.required", "அவசியம்"],
  ["form.optional", "விருப்பத்தேர்வு"],
  ["form.errorRequired", "இந்தப் புலம் அவசியம்."],
  ["form.loading", "காத்திருக்கவும்…"],
  ["site.inPreparation", "இந்த இணையதளம் தயாராகி வருகிறது."],
  ["special.typeLabel", "சிறப்புக் கூட்டம்"],
  ["special.empty", "சிறப்புக் கூட்டங்கள் தனித்தனியாக அறிவிக்கப்படும்."],
];

/**
 * R4 D9: approved by the owner on 4 Nov 2026 (decision O1), English and Tamil, with the owner's
 * wording for auth.accountRequest.retry ("request the link again" / "மீண்டும் இணைப்பைக் கோருங்கள்").
 * Written out again here, character for character.
 */
const R4_D9_APPROVED: Record<string, { en: string; ta: string }> = {
  "email.setPassword.subject": { en: "Set your password", ta: "உங்கள் கடவுச்சொல்லை அமைக்கவும்" },
  "email.setPassword.body": {
    en: "An account has been requested for this email address. Open the link below to choose your password. It works for 1 hour.",
    ta: "இந்த மின்னஞ்சல் முகவரிக்கு ஒரு கணக்கு கோரப்பட்டுள்ளது. உங்கள் கடவுச்சொல்லைத் தேர்ந்தெடுக்க கீழே உள்ள இணைப்பைத் திறக்கவும். அது 1 மணி நேரம் செல்லுபடியாகும்.",
  },
  "auth.accountRequest.hint": { en: "We will email you a link to choose your password.", ta: "உங்கள் கடவுச்சொல்லைத் தேர்ந்தெடுக்க ஒரு இணைப்பை மின்னஞ்சலில் அனுப்புவோம்." },
  "auth.accountRequest.sent": {
    en: "Check your email. If this address can be registered, we have sent a link to choose your password. It works for 1 hour.",
    ta: "உங்கள் மின்னஞ்சலைப் பாருங்கள். இந்த முகவரியைப் பதிவு செய்ய முடிந்தால், உங்கள் கடவுச்சொல்லைத் தேர்ந்தெடுக்க ஒரு இணைப்பை அனுப்பியுள்ளோம். அது 1 மணி நேரம் செல்லுபடியாகும்.",
  },
  "auth.accountRequest.retry": {
    en: "The email may take a few minutes to arrive. If nothing arrives within 10 minutes, please request the link again.",
    ta: "மின்னஞ்சல் வர சில நிமிடங்கள் ஆகலாம். 10 நிமிடங்களுக்குள் எதுவும் வரவில்லை என்றால், மீண்டும் இணைப்பைக் கோருங்கள்.",
  },
  "auth.setPassword.title": { en: "Choose your password", ta: "உங்கள் கடவுச்சொல்லைத் தேர்ந்தெடுக்கவும்" },
  "auth.setPassword.submit": { en: "Save password", ta: "கடவுச்சொல்லைச் சேமி" },
  "auth.setPassword.done": { en: "Your password is set. Please sign in.", ta: "உங்கள் கடவுச்சொல் அமைக்கப்பட்டது. உள்நுழையவும்." },
};

describe("Tamil approval record (owner sign-off, 1 Nov 2026)", () => {
  it("approves 154 items: 22 owner-supplied, 26 recommended (1 Nov), 15 Phase 5, 38 Phase 4b and 45 Phase 6b (2 Nov), 8 R4 D9 (4 Nov)", () => {
    const items = reviewItems();
    expect(items.filter((i) => i.status === "confirmed")).toHaveLength(154);
    // Only the two Google sign-in strings remain under review.
    expect(items.filter((i) => i.status !== "confirmed").map((i) => i.id).sort()).toEqual([...PENDING].sort());
    for (const i of items.filter((x) => x.status !== "confirmed")) expect(i.status, i.id).toBe("draft-review");
    expect(items.filter((i) => i.source === "owner-supplied")).toHaveLength(22);
    expect(items.filter((i) => i.source === "recommended")).toHaveLength(26);
    expect(items.filter((i) => i.source === "phase5-approved")).toHaveLength(15);
    expect(items.filter((i) => i.source === "phase4b-approved")).toHaveLength(38);
    expect(items.filter((i) => i.source === "phase6b-approved")).toHaveLength(45);
    expect(items.filter((i) => i.source === "r4d9-approved")).toHaveLength(8);
  });

  it("reproduces every R4 D9 approved string exactly, English and Tamil (owner sign-off, 4 Nov 2026)", () => {
    expect(Object.keys(R4_D9_APPROVED)).toHaveLength(8);
    expect(Object.keys(r4D9ApprovedTamil).sort()).toEqual(Object.keys(R4_D9_APPROVED).sort());
    const byId = Object.fromEntries(reviewItems().map((i) => [i.id, i]));
    for (const [id, { en, ta }] of Object.entries(R4_D9_APPROVED)) {
      expect(r4D9ApprovedTamil[id as keyof typeof r4D9ApprovedTamil], id).toBe(ta);
      const v = uiStrings[id as keyof typeof uiStrings];
      expect(v.en, id).toBe(en);
      expect(v.ta, id).toBe(ta);
      expect(v.taStatus, id).toBe("confirmed");
      expect(byId[id]?.source, id).toBe("r4d9-approved");
      expect(ta, id).toBe(ta.normalize("NFC"));
      expect(ta, id).toBe(ta.trim());
      expect(PENDING, id).not.toContain(id);
    }
  });

  it("reproduces every Phase 4b and Phase 6b approved string exactly (owner sign-off, 2 Nov 2026)", () => {
    expect(Object.keys(PHASE4B_APPROVED)).toHaveLength(38);
    expect(Object.keys(PHASE6B_APPROVED)).toHaveLength(45);
    expect(Object.keys(phase4bApprovedTamil).sort()).toEqual(Object.keys(PHASE4B_APPROVED).sort());
    expect(Object.keys(phase6bApprovedTamil).sort()).toEqual(Object.keys(PHASE6B_APPROVED).sort());
    const byId = Object.fromEntries(reviewItems().map((i) => [i.id, i]));
    const record = { ...phase4bApprovedTamil, ...phase6bApprovedTamil } as Record<string, string>;
    for (const [expected, source] of [
      [PHASE4B_APPROVED, "phase4b-approved"],
      [PHASE6B_APPROVED, "phase6b-approved"],
    ] as const) {
      for (const [id, ta] of Object.entries(expected)) {
        expect(record[id], id).toBe(ta);
        const v = uiStrings[id as keyof typeof uiStrings];
        expect(v.ta, id).toBe(ta);
        expect(v.taStatus, id).toBe("confirmed");
        expect(byId[id]?.source, id).toBe(source);
        expect(ta, id).toBe(ta.normalize("NFC"));
        expect(ta, id).toBe(ta.trim());
      }
    }
    for (const id of PENDING) expect(uiStrings[id as keyof typeof uiStrings].taStatus, id).toBe("draft-review");
  });

  it("reproduces every Phase 5 approved string exactly (owner sign-off, 2 Nov 2026)", () => {
    expect(Object.keys(phase5ApprovedTamil).sort()).toEqual(Object.keys(PHASE5_APPROVED).sort());
    const byId = Object.fromEntries(reviewItems().map((i) => [i.id, i]));
    for (const [id, ta] of Object.entries(PHASE5_APPROVED)) {
      expect(phase5ApprovedTamil[id as keyof typeof phase5ApprovedTamil], id).toBe(ta);
      const v = uiStrings[id as keyof typeof uiStrings];
      expect(v.ta, id).toBe(ta);
      expect(v.taStatus, id).toBe("confirmed");
      expect(byId[id]?.source, id).toBe("phase5-approved");
      expect(ta, id).toBe(ta.normalize("NFC"));
      expect(ta, id).toBe(ta.trim());
    }
  });

  it("reproduces every owner-supplied string exactly", () => {
    expect(Object.keys(ownerSuppliedTamil).sort()).toEqual(Object.keys(OWNER_SUPPLIED).sort());
    const byId = Object.fromEntries(reviewItems().map((i) => [i.id, i]));
    for (const [id, ta] of Object.entries(OWNER_SUPPLIED)) {
      expect(ownerSuppliedTamil[id as keyof typeof ownerSuppliedTamil].ta, id).toBe(ta);
      expect(byId[id]?.ta, id).toBe(ta);
      expect(byId[id]?.source, id).toBe("owner-supplied");
      expect(ta, id).toBe(ta.normalize("NFC"));
      expect(ta, id).toBe(ta.trim());
    }
  });

  it("keeps the 26 recommended drafts unchanged", () => {
    const byId = Object.fromEntries(reviewItems().map((i) => [i.id, i]));
    expect(APPROVED_AS_RECOMMENDED).toHaveLength(26);
    for (const [id, ta] of APPROVED_AS_RECOMMENDED) {
      expect(byId[id]?.ta, id).toBe(ta);
      expect(byId[id]?.source, id).toBe("recommended");
    }
  });

  it("leaves no draft-review Tamil outside the Google sign-in and throttle-alert strings, and no open alternatives", () => {
    for (const [key, v] of Object.entries(uiStrings)) {
      if (v.taStatus !== "confirmed") expect(PENDING, key).toContain(key);
      expect((v as { taAlternatives?: unknown }).taAlternatives, key).toBeUndefined();
      expect((v as { taShortAlternative?: unknown }).taShortAlternative, key).toBeUndefined();
    }
    for (const s of schedule) {
      expect(s.name.taStatus, s.id).toBe("confirmed");
      expect(s.name.taAlternatives, s.id).toBeUndefined();
    }
    expect(gate0ConfirmedTamil).toEqual(["lang.ta", "lang.en"]);
  });

  it("keeps the generated approval record in sync with the source strings", () => {
    const { md } = buildTamilReview();
    expect(readFileSync(REVIEW_SHEET, "utf8")).toBe(md);
    const pending = reviewItems().filter((i) => i.status !== "confirmed").length;
    expect(md).toContain(
      "(22 owner-supplied, 26 recommended drafts approved) **and on 2026-11-02** (15 Phase 5 public-site strings; 38 Phase 4b account and email strings and 45 Phase 6b two-factor strings, 2026-11-02) **and on 2026-11-04** (8 R4 D9 set-password strings, English and Tamil)",
    );
    expect(pending).toBe(PENDING.length);
    expect(md).toContain("154 of 158 items approved; 4 still awaiting review");
    for (const line of md.split("\n").filter((l) => l.includes("draft-review") && l.startsWith("| "))) {
      expect(PENDING).toContain(line.split("|")[1]!.trim());
    }
  });
});
