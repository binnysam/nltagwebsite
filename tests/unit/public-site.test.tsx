import { render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { vi } from "vitest";
import { EntryList, SiteFooter, SpecialMeetingCard } from "@/design-system/components";
import { churchName } from "@/content/church";
import { venueLabel, formatWhere, schedule } from "@/content/schedule";
import { t } from "@/content/ui-strings";
import { formatDateKey, formatKuwaitMeetingTime } from "@/lib/date";
import { Markdown } from "@/lib/markdown";
import type { PublicVerse } from "@/server/cms/public";
import { toVerseRecord, MeetingCards, SermonEntries, TestimonyEntries, VisitFacts, Empty } from "@/app/[locale]/_components/sections";
import { footerNav, headerNav, pageMetadata } from "@/app/[locale]/_components/site";

vi.mock("next/navigation", () => ({ usePathname: () => "/ta" }));

/** Phase 5 public website: components, mapping rules and copy. Fictional bracketed data only. */

async function expectNoA11yViolations(container: HTMLElement) {
  const result = await axe.run(container, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
  expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`)).toEqual([]);
}

const item = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "00000000-0000-4000-8000-000000000001", type: "SERMON" as const, slug: null, featured: false, unlisted: false, publishedAt: null,
  title: "[Title]", summary: "[Summary]", bodyMd: "", seoTitle: "", seoDescription: "", ...over,
});

describe("EntryList", () => {
  it("renders a labelled list of entries with h3 titles, meta, body and one action", async () => {
    const { container } = render(
      <section aria-labelledby="h">
        <h2 id="h">[Section]</h2>
        <EntryList
          label="[Section]"
          entries={[
            { id: "a", title: "[First]", meta: "[Meta]", children: <p>[Body]</p>, action: <a href="https://example.test">[Action]</a> },
            { id: "b", title: "[Second]", titleLang: "en" },
          ]}
        />
      </section>,
    );
    const list = screen.getByRole("list", { name: "[Section]" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("heading", { level: 3, name: "[First]" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 3, name: "[Second]" })).toHaveAttribute("lang", "en");
    expect(screen.getByText("[Meta]")).toBeVisible();
    await expectNoA11yViolations(container);
  });
});

describe("SiteFooter", () => {
  it("shows the confirmed church name in both languages and a named navigation", async () => {
    const { container } = render(<SiteFooter locale="ta" name={churchName} navItems={footerNav("ta")} note={t("schedule.timezone", "ta")} />);
    expect(screen.getByRole("contentinfo")).toBeVisible();
    expect(screen.getByText(churchName.ta)).toHaveAttribute("lang", "ta");
    expect(screen.getByText(churchName.en)).toHaveAttribute("lang", "en");
    const nav = screen.getByRole("navigation", { name: t("footer.nav", "ta") });
    expect(within(nav).getAllByRole("link")).toHaveLength(7);
    await expectNoA11yViolations(container);
  });
});

describe("SpecialMeetingCard (Phase 5 options)", () => {
  it("puts the page language first and shows the venue line", () => {
    render(<SpecialMeetingCard preset="kadal" typeLabel="Special meeting" dateLabel="[Date]" dateTime="2033-01-01T16:00:00.000Z" titleTa="[தலைப்பு]" titleEn="[Title]" primary="en" location="NECK" />);
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("[Title]");
    expect(screen.getByRole("heading", { level: 3 })).toHaveAttribute("lang", "en");
    expect(screen.getByText("[தலைப்பு]")).toHaveAttribute("lang", "ta");
    expect(screen.getByText("NECK")).toBeVisible();
  });

  it("falls back to the other language when the page language has no title, without an empty line", () => {
    const { container } = render(<SpecialMeetingCard preset="kadal" typeLabel="x" dateLabel="[Date]" dateTime="2033-01-01" titleTa="" titleEn="[Only English]" primary="ta" />);
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("[Only English]");
    expect(container.querySelectorAll("p")).toHaveLength(0);
  });
});

describe("public sections", () => {
  it("empty sections show the designed line, never invented content", () => {
    render(<><SermonEntries items={[]} locale="ta" /><MeetingCards items={[]} locale="en" /><Empty locale="en" /></>);
    expect(screen.getByText(t("section.comingSoon", "ta"))).toBeVisible();
    expect(screen.getByText(t("special.empty", "en"))).toBeVisible();
  });

  it("meeting cards: Kuwait date and time, venue wording, no address for members' homes", () => {
    render(
      <MeetingCards
        locale="en"
        items={[{ id: "m1", startsAt: new Date("2033-06-12T16:00:00Z"), endsAt: null, locationKind: "MEMBERS_HOMES", locationText: "", featured: false, ta: { title: "[தலைப்பு]", summary: "" }, en: { title: "[Title]", summary: "[Summary]" } }]}
      />,
    );
    expect(screen.getByText("Sunday, 12 June 2033 · 7:00 PM")).toBeVisible();
    expect(screen.getByText(venueLabel("members-homes", "en"))).toBeVisible();
    expect(screen.getByText("[Summary]")).toBeVisible();
  });

  it("sermons link out to the video with a safe rel; testimonies show anonymous authors as withheld", () => {
    render(
      <>
        <SermonEntries locale="en" items={[{ ...item(), speaker: "[Speaker]", bibleReference: "[Book 1:1]", sermonDate: "2035-02-01", videoUrl: "https://video.example.test/x" }]} />
        <TestimonyEntries locale="en" items={[{ ...item({ id: "t1", type: "TESTIMONY" }), author: null }]} />
      </>,
    );
    const link = screen.getByRole("link", { name: t("sermon.watch", "en") });
    expect(link).toHaveAttribute("href", "https://video.example.test/x");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("1 February 2035 · [Speaker] · [Book 1:1]")).toBeVisible();
    expect(screen.getByText(t("testimony.anonymous", "en"))).toBeVisible();
  });

  it("visit facts come only from the Gate 0 schedule: NECK and Friday 7:30–9:30 AM, no address", () => {
    const { container } = render(<VisitFacts locale="en" />);
    expect(screen.getByText("NECK")).toBeVisible();
    expect(screen.getByText("Every Friday, 7:30 – 9:30 AM")).toBeVisible();
    expect(container.textContent).not.toMatch(/street|block|road|avenue/i);
    expect(formatWhere(schedule[0]!, "en")).toBe("NECK");
  });
});

describe("Bible verse mapping (permission-aware)", () => {
  const verse = (text: { ta: string | null; en: string | null }): PublicVerse => ({
    id: "v1", dateKey: "2030-05-01", cardVariant: "compact", preset: "kadal",
    translations: [
      { translationId: "bsi-ta", locale: "ta", name: "[BSI]", reference: "[புத்தகம் 1:1]", text: text.ta, creditLine: text.ta ? "[TA credit]" : "", downloadsAllowed: false },
      { translationId: "nkjv-en", locale: "en", name: "NKJV", reference: "[Book 1:1]", text: text.en, creditLine: text.en ? "[EN credit]" : "", downloadsAllowed: false },
    ],
  });

  it("no verse published → designed fallback (null)", () => {
    expect(toVerseRecord(null, "ta")).toBeNull();
  });

  it("permission not verified → approved placeholder text with the published reference", () => {
    const r = toVerseRecord(verse({ ta: null, en: null }), "en")!;
    expect(r.isPlaceholder).toBe(true);
    expect(r.text.en).toBe(t("verse.placeholderText", "en"));
    expect(r.reference).toEqual({ ta: "[புத்தகம் 1:1]", en: "[Book 1:1]" });
  });

  it("only verified translations carry text and their credit line", () => {
    const r = toVerseRecord(verse({ ta: null, en: "[Fictional text]" }), "en")!;
    expect(r.isPlaceholder).toBe(false);
    expect(r.text).toEqual({ en: "[Fictional text]" });
    expect(r.publisherCredit).toBe("[EN credit]");
  });
});

describe("formatters and metadata", () => {
  it("formats Kuwait meeting times (Tamil uses the 24-hour clock) and calendar dates", () => {
    const d = new Date("2026-11-06T16:30:00Z");
    expect(formatKuwaitMeetingTime(d, "en")).toBe("Friday, 6 November 2026 · 7:30 PM");
    expect(formatKuwaitMeetingTime(d, "ta")).toMatch(/· 19:30$/);
    expect(formatDateKey("2026-11-06", "en")).toBe("6 November 2026");
    expect(formatDateKey("not-a-date", "en")).toBe("");
  });

  it("header keeps four approved links (wordmark is home); footer lists every public page", () => {
    expect(headerNav("ta").map((n) => n.href)).toEqual(["/ta/about", "/ta/worship-times", "/ta/sermons", "/ta/contact"]);
    expect(footerNav("en")).toHaveLength(7);
  });

  it("page metadata: hreflang pairs, x-default Tamil, and noindex until launch", () => {
    const m = pageMetadata("en", "sermons");
    expect(m.alternates).toEqual({ canonical: "/en/sermons", languages: { ta: "/ta/sermons", en: "/en/sermons", "x-default": "/ta/sermons" } });
    expect(m.robots).toEqual({ index: false, follow: false });
    expect(pageMetadata("ta", "home").title).toEqual({ absolute: `${churchName.ta} · NLTAG` });
  });

  it("Markdown headings inside list entries start below the entry title", () => {
    render(<Markdown source={"## [Heading]\n\n### [Sub]"} headingLevel={4} />);
    expect(screen.getByRole("heading", { level: 4, name: "[Heading]" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 5, name: "[Sub]" })).toBeVisible();
  });
});
