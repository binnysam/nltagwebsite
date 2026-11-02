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

/** Interface strings confirmed at Gate 0, before the Tamil review. Not part of the 48. */
export const gate0ConfirmedTamil = ["lang.ta", "lang.en"] as const;
