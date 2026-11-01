import { schedule, formatWhen, formatWhere } from "@/content/schedule";
import { uiStrings } from "@/content/ui-strings";
import { placeholderVerse } from "@/content/bible";
import { switchLocalePath } from "@/lib/i18n";
import { kuwaitDateKey, formatKuwaitDate } from "@/lib/date";

const byId = (id: string) => schedule.find((s) => s.id === id)!;

describe("schedule (Gate 0)", () => {
  it("matches the approved English schedule exactly", () => {
    expect(schedule.map((s) => [s.name.en, formatWhen(s, "en"), formatWhere(s, "en")])).toEqual([
      ["Main Worship Service", "Every Friday, 7:30 – 9:30 AM", "NECK"],
      ["Sunday School", "Every Friday, 9:30 – 10:30 AM", "NECK"],
      ["Fasting Prayer", "Every Saturday, 7:30 – 8:30 PM", "NECK"],
      ["Cottage Meeting", "Every Tuesday, 7:30 – 8:30 PM", "Church members' homes"],
      ["Ladies Meeting", "Last Thursday of every month, 7:00 – 9:00 PM", "NECK"],
      ["Special Meetings", "Announced individually", "Depends on the event"],
    ]);
  });

  it("renders the approved Tamil schedule wording", () => {
    expect(formatWhen(byId("main-worship"), "ta")).toBe("ஒவ்வொரு வெள்ளிக்கிழமை, காலை 7:30 – 9:30");
    expect(formatWhen(byId("fasting-prayer"), "ta")).toBe("ஒவ்வொரு சனிக்கிழமை, மாலை 7:30 – 8:30");
    expect(formatWhen(byId("ladies-meeting"), "ta")).toBe("ஒவ்வொரு மாதத்தின் கடைசி வியாழக்கிழமை, மாலை 7:00 – 9:00");
    expect(formatWhere(byId("cottage-meeting"), "ta")).toBe("சபை அங்கத்தினர்களின் வீடுகளில்");
  });

  it("never presents Sunday School on a Sunday", () => {
    const s = byId("sunday-school");
    expect(s.recurrence).toEqual({ kind: "weekly", weekday: 5 });
    // Owner-approved Tamil name (1 Nov 2026). "ஞாயிறு" here is part of the name; the day is Friday.
    expect(s.name.ta).toBe("ஞாயிறு பள்ளி");
    expect(formatWhen(s, "ta")).toBe("ஒவ்வொரு வெள்ளிக்கிழமை, காலை 9:30 – 10:30");
    expect(formatWhen(s, "ta")).not.toContain("ஞாயிற்றுக்கிழமை");
  });

  it("writes NECK exactly and publishes no address", () => {
    for (const s of schedule) {
      const where = formatWhere(s, "en") + formatWhere(s, "ta");
      expect(where).not.toMatch(/street|block|avenue|road|kuwait city/i);
    }
    expect(formatWhere(byId("main-worship"), "ta")).toBe("NECK");
  });
});

describe("interface strings", () => {
  it("has Tamil and English for every key, and a known Tamil status", () => {
    for (const [key, v] of Object.entries(uiStrings)) {
      expect(v.en.trim(), key).not.toBe("");
      expect(v.ta.trim(), key).not.toBe("");
      expect(["confirmed", "draft-review"], key).toContain(v.taStatus);
    }
  });
  it("uses Friday wording for the main CTA", () => {
    expect(uiStrings["cta.joinFriday"].en).toBe("Join us this Friday");
  });
});

describe("Bible placeholder", () => {
  it("is marked as a placeholder and carries no Scripture wording", () => {
    const v = placeholderVerse("ta");
    expect(v.isPlaceholder).toBe(true);
    expect(v.text.en).toBe(uiStrings["verse.placeholderText"].en);
    expect(v.translation).toEqual({ ta: "BSI Tamil (edition to confirm)", en: "NKJV" });
  });
});

describe("locale helpers", () => {
  it("swaps the locale segment and keeps the path", () => {
    expect(switchLocalePath("/ta/design-system", "en")).toBe("/en/design-system");
    expect(switchLocalePath("/en", "ta")).toBe("/ta");
    expect(switchLocalePath("/", "en")).toBe("/en");
  });
  it("uses the Kuwait calendar day", () => {
    // 22:30 UTC on 31 Oct is 01:30 on 1 Nov in Kuwait (UTC+3).
    expect(kuwaitDateKey(new Date("2026-10-31T22:30:00Z"))).toBe("2026-11-01");
    expect(formatKuwaitDate(new Date("2026-10-31T22:30:00Z"), "en")).toBe("1 November 2026");
  });
});
