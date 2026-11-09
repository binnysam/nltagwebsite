// Generates the Tamil approval record, docs/content/tamil-content-review.md, from the content modules.
//   node scripts/tamil-review.ts          regenerate the sheet
//   node scripts/tamil-review.ts --check  exit 1 if the committed sheet is out of date (used by `npm run verify`)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { uiStrings, type ReviewStatus } from "../src/content/ui-strings.ts";
import { schedule } from "../src/content/schedule.ts";
import {
  gate0ConfirmedTamil,
  ownerSuppliedTamil,
  phase4bApprovedTamil,
  phase5ApprovedTamil,
  phase6bApprovedTamil,
  phaseAApprovedTamil,
  PHASEA_APPROVAL_DATE,
  PHASE5_APPROVAL_DATE,
  PHASE6_APPROVAL_DATE,
  TAMIL_APPROVAL_DATE,
  type OwnerSuppliedTamil,
} from "../src/content/tamil-approvals.ts";

export const REVIEW_SHEET = fileURLToPath(new URL("../docs/content/tamil-content-review.md", import.meta.url));

export type ApprovalSource = "owner-supplied" | "recommended" | "phase5-approved" | "phase4b-approved" | "phase6b-approved" | "phaseA-approved";

export interface ReviewItem {
  id: string;
  en: string;
  ta: string;
  note: string;
  status: ReviewStatus;
  /** How the Tamil was approved; absent while the item is still under review. */
  source?: ApprovalSource;
  /** Wording that was under review before the owner supplied the final Tamil. */
  previousDraft?: string;
}

const owner = ownerSuppliedTamil as Record<string, OwnerSuppliedTamil>;
const sourceOf = (id: string, status: ReviewStatus): ApprovalSource | undefined =>
  status !== "confirmed"
    ? undefined
    : id in owner
      ? "owner-supplied"
      : id in phase5ApprovedTamil
        ? "phase5-approved"
        : id in phase4bApprovedTamil
          ? "phase4b-approved"
          : id in phase6bApprovedTamil
            ? "phase6b-approved"
            : id in phaseAApprovedTamil
              ? "phaseA-approved"
              : "recommended";
const previousOf = (id: string, ta: string) => {
  const p = owner[id]?.previousDraft;
  return p && p !== ta ? p : undefined;
};

/** Every Tamil string that went through the church review (Gate 0 language names excluded). */
export function reviewItems(): ReviewItem[] {
  const items: ReviewItem[] = [];
  const add = (id: string, en: string, ta: string, note: string, status: ReviewStatus) =>
    items.push({ id, en, ta, note, status, source: sourceOf(id, status), previousDraft: previousOf(id, ta) });

  for (const i of schedule) {
    const note =
      i.id === "sunday-school"
        ? "Held on Friday. The approved Tamil is the name of the gathering; the day shown is always Friday."
        : i.id === "cottage-meeting"
          ? "Host addresses are never published."
          : "";
    add(`schedule.${i.id}`, i.name.en, i.name.ta, note, i.name.taStatus);
  }
  // Formatter wording in src/content/schedule.ts (not keyed strings).
  add("time.evening", "PM (7:00–9:30 PM gatherings)", "மாலை", "Fasting Prayer, Cottage Meeting, Ladies Meeting", "confirmed");
  add("time.morning", "AM", "காலை", "", "confirmed");
  add("preview.heroTitle", "New Life Tamil AG Church", ownerSuppliedTamil["preview.heroTitle"].ta, "Church name in Tamil. Hero copy beyond the name is CONTENT REQUIRED.", "confirmed");
  for (const [id, v] of Object.entries(uiStrings)) {
    if ((gate0ConfirmedTamil as readonly string[]).includes(id)) continue;
    const vv = v as { en: string; ta: string; note?: string; taStatus: ReviewStatus };
    add(id, vv.en, vv.ta, vv.note ?? "", vv.taStatus);
  }
  return items;
}

/** Tamil rendered by formatters that has not been through the review yet. */
export const notYetReviewed: readonly { where: string; ta: string }[] = [
  { where: "Weekday names (schedule)", ta: "ஞாயிற்றுக்கிழமை … சனிக்கிழமை" },
  { where: "Weekly recurrence prefix", ta: "ஒவ்வொரு" },
  { where: "Monthly recurrence", ta: "ஒவ்வொரு மாதத்தின் கடைசி" },
  { where: "Special meetings, when", ta: "தனித்தனியாக அறிவிக்கப்படும்" },
  { where: "Cottage Meeting, where", ta: "சபை அங்கத்தினர்களின் வீடுகளில்" },
  { where: "Special meetings, where", ta: "நிகழ்ச்சியைப் பொறுத்து" },
  { where: "Dates (month names from the standard Intl formatter, src/lib/date.ts)", ta: "1 நவம்பர், 2026" },
];

const esc = (s: string) => s.replace(/\|/g, "\\|");
const statusLabel = (s: ReviewStatus) => (s === "draft-review" ? "Awaiting church review (`draft-review`)" : s === "confirmed" ? "Approved (`confirmed`)" : s);
const sourceLabel = (s?: ApprovalSource) =>
  s === "owner-supplied"
    ? "Owner-supplied"
    : s === "recommended"
      ? "Recommended draft approved"
      : s === "phase5-approved"
        ? `Approved ${PHASE5_APPROVAL_DATE} (Phase 5)`
        : s === "phase4b-approved"
          ? `Approved ${PHASE6_APPROVAL_DATE} (Phase 4b accounts and emails)`
          : s === "phase6b-approved"
            ? `Approved ${PHASE6_APPROVAL_DATE} (Phase 6b two-factor)`
            : s === "phaseA-approved"
              ? `Approved ${PHASEA_APPROVAL_DATE} (website Phase A)`
              : "—";

export function buildTamilReview(): { md: string; count: number } {
  const items = reviewItems();
  const confirmed = items.filter((i) => i.status === "confirmed");
  const ownerCount = items.filter((i) => i.source === "owner-supplied").length;
  const recommendedCount = items.filter((i) => i.source === "recommended").length;
  const phase5Count = items.filter((i) => i.source === "phase5-approved").length;
  const phase4bCount = items.filter((i) => i.source === "phase4b-approved").length;
  const phase6bCount = items.filter((i) => i.source === "phase6b-approved").length;
  const phaseACount = items.filter((i) => i.source === "phaseA-approved").length;
  const pending = items.length - confirmed.length;
  const rows = items.map(
    (i) => `| ${i.id} | ${esc(i.en)} | ${esc(i.ta)} | ${sourceLabel(i.source)} | ${i.previousDraft ? esc(i.previousDraft) : "—"} | ${esc(i.note)} | ${statusLabel(i.status)} |`,
  );
  const md = `# Tamil content approval record

**Generated from** \`src/content/ui-strings.ts\`, \`src/content/schedule.ts\` and \`src/content/tamil-approvals.ts\` by \`node scripts/tamil-review.ts\`. Do not edit by hand; \`npm run verify\` fails if this file is out of date.
**Approved by the owner on ${TAMIL_APPROVAL_DATE}** (${ownerCount} owner-supplied, ${recommendedCount} recommended drafts approved) **and on ${PHASE5_APPROVAL_DATE}** (${phase5Count} Phase 5 public-site strings; ${phase4bCount} Phase 4b account and email strings and ${phase6bCount} Phase 6b two-factor strings, ${PHASE6_APPROVAL_DATE}) **and on ${PHASEA_APPROVAL_DATE}** (${phaseACount} website Phase A strings). ${confirmed.length} of ${items.length} items approved${pending ? `; ${pending} still awaiting review` : "; none awaiting review"}. Times, days and NECK were confirmed at Gate 0.

Owner-supplied Tamil is approved content and is reproduced exactly as supplied. Do not rephrase, re-spell or "correct" it; a unit test compares every character. Any change needs new owner approval. The language names தமிழ் and English were confirmed at Gate 0 and are not listed.

## All items

| ID | English | Approved Tamil | How approved | Previous draft | Note | Status |
|---|---|---|---|---|---|---|
${rows.join("\n")}

## Not yet in the record

These Tamil phrases are produced by formatters in \`src/content/schedule.ts\` and \`src/lib/date.ts\`. They were not part of the 48 reviewed items and still need owner confirmation before public launch.

| Where | Tamil |
|---|---|
${notYetReviewed.map((n) => `| ${esc(n.where)} | ${esc(n.ta)} |`).join("\n")}
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
    console.log(`Tamil approval record in sync (${count} items).`);
  } else {
    writeFileSync(REVIEW_SHEET, md);
    console.log("items:", count);
  }
}
