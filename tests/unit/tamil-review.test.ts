// @vitest-environment node
import { readFileSync } from "node:fs";
import { buildTamilReview, reviewItems, REVIEW_SHEET } from "../../scripts/tamil-review.ts";
import { uiStrings } from "@/content/ui-strings";
import { schedule } from "@/content/schedule";
import { ownerSuppliedTamil, gate0ConfirmedTamil } from "@/content/tamil-approvals";

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
 * Tamil awaiting owner review: Phase 4b account and email wording (1 Nov 2026) and the Phase 5
 * public-site wording (2 Nov 2026, listed exactly so nothing else can slip in). The Phase 5 PR
 * must not merge until the owner approves or replaces these (docs/content/tamil-content-review.md).
 */
const PHASE5_PENDING = [
  "nav.ministries", "nav.testimonies", "footer.nav", "section.announcements", "section.specialMeetings", "section.visit",
  "section.comingSoon", "action.viewAll", "action.readMore", "sermon.watch", "testimony.anonymous", "ministry.contact",
  "special.location.tba", "visit.where", "visit.when",
];
const PENDING_PREFIXES = new RegExp(`^((auth|account|email)\\.|(${PHASE5_PENDING.map((k) => k.replace(".", "\\.")).join("|")})$)`);

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

describe("Tamil approval record (owner sign-off, 1 Nov 2026)", () => {
  it("approves all 48 reviewed items: 22 owner-supplied and 26 recommended", () => {
    const items = reviewItems();
    expect(items.filter((i) => i.status === "confirmed")).toHaveLength(48);
    // Everything else is new Phase 4b account wording, awaiting owner review.
    for (const i of items.filter((x) => x.status !== "confirmed")) {
      expect(i.id, i.id).toMatch(PENDING_PREFIXES);
      expect(i.status, i.id).toBe("draft-review");
    }
    expect(items.filter((i) => i.source === "owner-supplied")).toHaveLength(22);
    expect(items.filter((i) => i.source === "recommended")).toHaveLength(26);
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

  it("leaves no draft-review Tamil outside the new Phase 4b account wording, and no open alternatives", () => {
    for (const [key, v] of Object.entries(uiStrings)) {
      if (v.taStatus !== "confirmed") expect(key).toMatch(PENDING_PREFIXES);
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
    expect(md).toContain(`48 of ${48 + pending} items approved (22 owner-supplied, 26 recommended drafts approved)`);
    for (const line of md.split("\n").filter((l) => l.includes("draft-review") && l.startsWith("| "))) {
      expect(line.split("|")[1]!.trim()).toMatch(PENDING_PREFIXES);
    }
  });
});
