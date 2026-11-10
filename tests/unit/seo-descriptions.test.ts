import { describe, expect, it } from "vitest";
import { listDescription, listDescriptions } from "@/content/seo";
import { pageMetadata } from "@/app/[locale]/_components/site";

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

  it("Tamil stays unpublished until the owner approves it", () => {
    for (const page of Object.keys(APPROVED_EN) as (keyof typeof APPROVED_EN)[]) {
      expect(listDescriptions[page].ta).toBeNull();
      expect(listDescription("ta", page)).toBeUndefined();
    }
  });

  it("feeds the description, Open Graph and Twitter tags on English pages only", () => {
    const en = pageMetadata("en", "sermons", { description: listDescription("en", "sermons") });
    expect(en.description).toBe(APPROVED_EN.sermons);
    expect(en.openGraph).toMatchObject({ description: APPROVED_EN.sermons });
    expect(en.twitter).toMatchObject({ description: APPROVED_EN.sermons });
    const ta = pageMetadata("ta", "sermons", { description: listDescription("ta", "sermons") });
    expect(ta.description).toBeUndefined();
    expect(ta.openGraph).toMatchObject({ description: undefined });
  });
});
