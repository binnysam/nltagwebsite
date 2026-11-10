import { describe, expect, it } from "vitest";
import { listDescription, listDescriptions } from "@/content/seo";
import { pageMetadata } from "@/app/[locale]/_components/site";

// Tamil approved by the owner on 10 Nov 2026 exactly as proposed (QA report §12.5).
const APPROVED_TA = {
  home: "புது வாழ்வு தமிழ் AG சபை, குவைத். ஆராதனை அட்டவணை, தேவ செய்திகள், சாட்சிகள் மற்றும் வரவிருக்கும் விசேஷ ஆராதனைகள்.",
  sermons: "புது வாழ்வு தமிழ் AG சபையின் தேவ செய்திகள். தலைப்பு அல்லது பிரசங்கியார் பெயரால் தேடிப் பாருங்கள்.",
  worshipTimes: "புது வாழ்வு தமிழ் AG சபையின் ஆராதனை அட்டவணை மற்றும் வரவிருக்கும் விசேஷ ஆராதனைகள். அனைத்து நேரங்களும் குவைத் நேரம்.",
  testimonies: "புது வாழ்வு தமிழ் AG சபையின் சாட்சிகள். ஒவ்வொரு சாட்சியும் சபை வாசித்த பின், எழுதியவரின் அனுமதியுடன் வெளியிடப்படுகிறது.",
} as const;

// English approved by the owner on 10 Nov 2026 exactly as proposed (QA report §12.5). Locked here
// so any change to the wording is deliberate.
const APPROVED_EN = {
  home: "New Life Tamil AG Church in Kuwait. Worship schedule, sermons, testimonies and upcoming special meetings, in Tamil and English.",
  sermons: "Sermons from New Life Tamil AG Church, Kuwait. Search by title or speaker.",
  worshipTimes: "Worship schedule and upcoming special meetings of New Life Tamil AG Church. All times are Kuwait time.",
  testimonies: "Testimonies from New Life Tamil AG Church, Kuwait. Each testimony is published with the author's permission after the church has read it.",
} as const;

describe("list page descriptions (SEO)", () => {
  it("English is exactly the approved wording and fits a search snippet", () => {
    for (const [page, text] of Object.entries(APPROVED_EN)) {
      expect(listDescriptions[page as keyof typeof APPROVED_EN].en).toBe(text);
      expect(text.length).toBeLessThanOrEqual(160);
    }
    expect(Object.keys(listDescriptions).sort()).toEqual(Object.keys(APPROVED_EN).sort());
  });

  it("Tamil is exactly the approved wording", () => {
    for (const [page, text] of Object.entries(APPROVED_TA)) {
      expect(listDescriptions[page as keyof typeof APPROVED_TA].ta).toBe(text);
      expect(listDescription("ta", page as keyof typeof APPROVED_TA)).toBe(text);
    }
  });

  it("feeds the description, Open Graph and Twitter tags in both languages", () => {
    const en = pageMetadata("en", "sermons", { description: listDescription("en", "sermons") });
    expect(en.description).toBe(APPROVED_EN.sermons);
    expect(en.openGraph).toMatchObject({ description: APPROVED_EN.sermons });
    expect(en.twitter).toMatchObject({ description: APPROVED_EN.sermons });
    const ta = pageMetadata("ta", "sermons", { description: listDescription("ta", "sermons") });
    expect(ta.description).toBe(APPROVED_TA.sermons);
    expect(ta.openGraph).toMatchObject({ description: APPROVED_TA.sermons });
    expect(ta.twitter).toMatchObject({ description: APPROVED_TA.sermons });
  });

  it("links the approved share image with the church name as alt text in both languages", () => {
    for (const locale of ["en", "ta"] as const) {
      const m = pageMetadata(locale, "home");
      const alt = locale === "en" ? "New Life Tamil AG Church" : "புது வாழ்வு தமிழ் AG சபை";
      expect(m.openGraph).toMatchObject({ images: [{ url: "/og/nltag-share-1200x630.jpg", width: 1200, height: 630, alt }] });
      expect(m.twitter).toMatchObject({ card: "summary_large_image", images: [{ url: "/og/nltag-share-1200x630.jpg", alt }] });
    }
  });
});
