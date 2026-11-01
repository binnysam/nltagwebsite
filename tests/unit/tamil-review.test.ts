// @vitest-environment node
import { readFileSync } from "node:fs";
import { buildTamilReview, reviewItems, REVIEW_SHEET } from "../../scripts/tamil-review.ts";
import { uiStrings } from "@/content/ui-strings";

describe("Tamil review (church approval gate)", () => {
  it("keeps all 48 Tamil strings in draft-review", () => {
    const items = reviewItems();
    expect(items).toHaveLength(48);
    expect(items.filter((i) => i.status !== "draft-review").map((i) => i.id)).toEqual([]);
  });

  it("confirms no Tamil wording except the language names", () => {
    const confirmed = Object.entries(uiStrings).filter(([, v]) => v.taStatus === "confirmed").map(([k]) => k);
    expect(confirmed).toEqual(["lang.ta", "lang.en"]);
  });

  it("keeps the generated review sheet in sync with the source strings", () => {
    expect(readFileSync(REVIEW_SHEET, "utf8")).toBe(buildTamilReview().md);
  });

  it("highlights the short Tamil CTA alternative for church review", () => {
    const cta = uiStrings["cta.joinFriday"];
    expect(cta.taShortAlternative).toBe("இந்த வெள்ளிக்கிழமை வாருங்கள்");
    expect(cta.taStatus).toBe("draft-review");
    const { md } = buildTamilReview();
    expect(md).toContain("## For church decision: short wording");
    expect(md).toContain("**Short alternative: இந்த வெள்ளிக்கிழமை வாருங்கள்**");
  });

});
