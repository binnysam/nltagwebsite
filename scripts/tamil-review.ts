// Generates docs/content/tamil-content-review.md from the content modules.
//   node scripts/tamil-review.ts          regenerate the sheet
//   node scripts/tamil-review.ts --check  exit 1 if the committed sheet is out of date (used by `npm run verify`)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { uiStrings, type ReviewStatus } from "../src/content/ui-strings.ts";
import { schedule } from "../src/content/schedule.ts";

export const REVIEW_SHEET = fileURLToPath(new URL("../docs/content/tamil-content-review.md", import.meta.url));

export interface ReviewItem {
  id: string;
  en: string;
  ta: string;
  alternatives: readonly string[];
  short?: string;
  note: string;
  status: ReviewStatus;
}

/** Every Tamil string that still needs church review, in sheet order. */
export function reviewItems(): ReviewItem[] {
  const items: ReviewItem[] = [];
  for (const i of schedule) {
    const note =
      i.id === "sunday-school"
        ? "Held on Friday. Avoid ஞாயிறு பள்ளி. Confirm audience (children or all ages)."
        : i.id === "cottage-meeting"
          ? "Host addresses are never published."
          : "";
    items.push({ id: `schedule.${i.id}`, en: i.name.en, ta: i.name.ta, alternatives: i.name.taAlternatives, note, status: i.name.taStatus });
  }
  // Formatter wording in src/content/schedule.ts (not keyed strings).
  items.push({ id: "time.evening", en: "PM (7:00–9:30 PM gatherings)", ta: "மாலை", alternatives: ["இரவு"], note: "Fasting Prayer, Cottage Meeting, Ladies Meeting", status: "draft-review" });
  items.push({ id: "time.morning", en: "AM", ta: "காலை", alternatives: [], note: "", status: "draft-review" });
  items.push({ id: "preview.heroTitle", en: "New Life Tamil AG Church", ta: "நியூ லைஃப் தமிழ் ஏ.ஜி. சபை", alternatives: ["நியூ லைஃப் தமிழ் அசெம்பிளீஸ் ஆஃப் காட் சபை"], note: "Phase 1 preview only; real hero copy is CONTENT REQUIRED", status: "draft-review" });
  for (const [id, v] of Object.entries(uiStrings)) {
    if (v.taStatus === "confirmed") continue;
    const vv = v as { en: string; ta: string; taAlternatives?: readonly string[]; taShortAlternative?: string; note?: string; taStatus: ReviewStatus };
    items.push({ id, en: vv.en, ta: vv.ta, alternatives: vv.taAlternatives ?? [], short: vv.taShortAlternative, note: vv.note ?? "", status: vv.taStatus });
  }
  return items;
}

const esc = (s: string) => s.replace(/\|/g, "\\|");
const statusLabel = (s: ReviewStatus) => (s === "draft-review" ? "Awaiting church review (`draft-review`)" : s);

export function buildTamilReview(): { md: string; count: number } {
  const items = reviewItems();
  const shorts = items.filter((i) => i.short);
  const rows = items.map((i) => {
    const alts = [...(i.short ? [`**Short: ${esc(i.short)}**`] : []), ...i.alternatives.map(esc)].join(" · ") || "—";
    return `| ${i.id} | ${esc(i.en)} | ${esc(i.ta)} | ${alts} | ${esc(i.note)} | ${statusLabel(i.status)} |`;
  });
  const highlight = shorts.length
    ? `## For church decision: short wording

${shorts
  .map(
    (i) => `- **${i.id}** (“${esc(i.en)}”)
  - Recommended: ${i.ta}
  - **Short alternative: ${i.short}**
  - Why: ${esc(i.note)}`,
  )
  .join("\n")}

`
    : "";
  const md = `# Tamil content review sheet

**Generated from** \`src/content/ui-strings.ts\` and \`src/content/schedule.ts\` by \`node scripts/tamil-review.ts\`. Do not edit by hand; \`npm run verify\` fails if this file is out of date.
**Status:** ${items.length} items awaiting church review, all \`draft-review\`. Times, days and NECK are confirmed (Gate 0); only Tamil wording is under review.

How to review: for each row, approve the recommended Tamil, pick an alternative, or write a replacement. Approved items change to \`taStatus: "confirmed"\` in the source; nothing in Tamil goes live on a public page before that.

${highlight}## All items

| ID | English | Recommended Tamil | Alternatives | Note | Status |
|---|---|---|---|---|---|
${rows.join("\n")}
`;
  return { md, count: items.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { md, count } = buildTamilReview();
  if (process.argv.includes("--check")) {
    const current = readFileSync(REVIEW_SHEET, "utf8");
    if (current !== md) {
      console.error("docs/content/tamil-content-review.md is out of date. Run: node scripts/tamil-review.ts");
      process.exit(1);
    }
    console.log(`Tamil review sheet in sync (${count} items).`);
  } else {
    writeFileSync(REVIEW_SHEET, md);
    console.log("items:", count);
  }
}
