// Regenerates docs/content/tamil-content-review.md from the content modules.
// Run: node scripts/tamil-review.ts
import { writeFileSync } from "node:fs";
import { uiStrings } from "../src/content/ui-strings.ts";
import { schedule } from "../src/content/schedule.ts";

const esc = (s: string) => s.replace(/\|/g, "\\|");
const rows: string[] = [];
rows.push("| ID | English | Recommended Tamil | Alternatives | Note | Status |", "|---|---|---|---|---|---|");
for (const i of schedule) {
  const note = i.id === "sunday-school" ? "Held on Friday. Avoid ஞாயிறு பள்ளி. Confirm audience (children or all ages)." : i.id === "cottage-meeting" ? "Host addresses are never published." : "";
  rows.push(`| schedule.${i.id} | ${i.name.en} | ${i.name.ta} | ${i.name.taAlternatives.join(" · ") || "—"} | ${note} | Awaiting church review |`);
}
rows.push("| time.evening | PM (7:00–9:30 PM gatherings) | மாலை | இரவு | Fasting Prayer, Cottage Meeting, Ladies Meeting | Awaiting church review |");
rows.push("| time.morning | AM | காலை | — | | Awaiting church review |");
rows.push("| preview.heroTitle | New Life Tamil AG Church | நியூ லைஃப் தமிழ் ஏ.ஜி. சபை | நியூ லைஃப் தமிழ் அசெம்பிளீஸ் ஆஃப் காட் சபை | Phase 1 preview only; real hero copy is CONTENT REQUIRED | Awaiting church review |");
for (const [k, v] of Object.entries(uiStrings)) {
  if (v.taStatus === "confirmed") continue;
  const vv = v as { en: string; ta: string; taAlternatives?: readonly string[]; note?: string };
  rows.push(`| ${k} | ${esc(vv.en)} | ${esc(vv.ta)} | ${(vv.taAlternatives ?? []).join(" · ") || "—"} | ${esc(vv.note ?? "")} | Awaiting church review |`);
}
const md = `# Tamil content review sheet

**Generated from** \`src/content/ui-strings.ts\` and \`src/content/schedule.ts\` by \`node scripts/tamil-review.ts\`. Do not edit by hand.
**Status:** ${rows.length - 2} items awaiting church review. Times, days and NECK are confirmed (Gate 0); only Tamil wording is under review.

How to review: for each row, approve the recommended Tamil, pick an alternative, or write a replacement. Approved items change to \`taStatus: "confirmed"\` in the source; nothing in Tamil goes live on a public page before that.

Known layout note: the recommended Tamil "Join us this Friday" wraps to two lines in a 390px pill. A shorter option (for example "இந்த வெள்ளிக்கிழமை வாருங்கள்") would fit one line.

${rows.join("\n")}
`;
writeFileSync(new URL("../docs/content/tamil-content-review.md", import.meta.url), md);
console.log("items:", rows.length - 2);
