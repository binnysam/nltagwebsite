import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { EntryList } from "@/design-system/components";
import { t } from "@/content/ui-strings";
import { filterSermons, listQuery, paginate, readSermonFilter, speakersOf } from "@/lib/listing";
import { FIXED_ROUTE_SLUGS, isDetailKey, toMenuPages } from "@/server/cms/public-site";
import type { PublicItem, PublicSermon } from "@/server/cms/public";
import { Pagination } from "@/app/[locale]/_components/Pagination";
import { SermonEntries, TestimonyEntries } from "@/app/[locale]/_components/sections";
import { detailHref, footerNav, itemKey, pageMetadata } from "@/app/[locale]/_components/site";

vi.mock("next/navigation", () => ({ usePathname: () => "/ta" }));

/** Website completion, Phase A (Nov 2026). Fictional bracketed data only. */

const ID = "00000000-0000-4000-8000-0000000000a1";
const page = (over: Partial<PublicItem>): PublicItem => ({
  id: ID, type: "PAGE", slug: "x", featured: false, unlisted: false, publishedAt: null,
  title: "[Page]", summary: "", bodyMd: "", seoTitle: "", seoDescription: "", ...over,
});
const sermon = (over: Partial<PublicSermon>): PublicSermon => ({
  ...page({ type: "SERMON", slug: null }), speaker: "", bibleReference: "", sermonDate: null, videoUrl: "", ...over,
});

describe("CMS pages in the menu", () => {
  it("lists published public pages with a title, sorted, without reserved, fixed-route or unlisted slugs", () => {
    const pages = [
      page({ slug: "zeta", title: "[Zeta]" }),
      page({ slug: "alpha", title: "[Alpha]" }),
      page({ slug: "hidden", title: "[Hidden]", unlisted: true }),
      page({ slug: "no-title", title: "" }),
      page({ slug: null, title: "[No slug]" }),
      ...[...FIXED_ROUTE_SLUGS].map((slug) => page({ slug, title: `[${slug}]` })),
    ];
    expect(toMenuPages(pages, "en")).toEqual([{ slug: "alpha", title: "[Alpha]" }, { slug: "zeta", title: "[Zeta]" }]);
  });

  it("covers every fixed public route and reserved slug", () => {
    for (const s of ["welcome", "about", "contact", "worship-times", "sermons", "ministries", "testimonies", "sign-in", "account"]) {
      expect(FIXED_ROUTE_SLUGS.has(s), s).toBe(true);
    }
  });

  it("adds them to the footer after the fixed pages, in the page language", () => {
    const nav = footerNav("ta", [{ slug: "history", title: "[வரலாறு]" }]);
    expect(nav).toHaveLength(8);
    expect(nav.at(-1)).toEqual({ href: "/ta/history", label: "[வரலாறு]" });
    expect(footerNav("en")).toHaveLength(7);
  });
});

describe("detail pages", () => {
  it("addresses a record by slug, else id", () => {
    expect(itemKey({ id: ID, slug: "easter" })).toBe("easter");
    expect(itemKey({ id: ID, slug: null })).toBe(ID);
    expect(detailHref("en", "sermons", { id: ID, slug: null })).toBe(`/en/sermons/${ID}`);
  });

  it("accepts only slug- or uuid-shaped keys", () => {
    for (const ok of ["easter-2026", ID]) expect(isDetailKey(ok), ok).toBe(true);
    for (const bad of ["", "Easter", "a/b", "../x", "x".repeat(121), "%27", "a--b", "-a", "a-"]) expect(isDetailKey(bad), bad).toBe(false);
  });

  it("links sermon and testimony titles to their own page and keeps the Watch link", () => {
    render(<SermonEntries locale="en" items={[sermon({ title: "[S]", videoUrl: "https://video.example.test/1" })]} />);
    expect(screen.getByRole("link", { name: "[S]" })).toHaveAttribute("href", `/en/sermons/${ID}`);
    expect(screen.getByRole("link", { name: t("sermon.watch", "en") })).toHaveAttribute("href", "https://video.example.test/1");
    render(<TestimonyEntries locale="ta" items={[{ ...page({ type: "TESTIMONY", slug: null, title: "[T]" }), author: null }]} />);
    expect(screen.getByRole("link", { name: "[T]" })).toHaveAttribute("href", `/ta/testimonies/${ID}`);
  });

  it("EntryList keeps plain titles when no href is given", () => {
    render(<EntryList entries={[{ id: "a", title: "[Plain]" }]} />);
    expect(screen.getByRole("heading", { name: "[Plain]" }).querySelector("a")).toBeNull();
  });
});

describe("sermon search, speaker filter and pagination", () => {
  const items = [
    sermon({ id: "1", title: "[Grace]", speaker: "[Speaker B]", bibleReference: "[John 3]" }),
    sermon({ id: "2", title: "[கிருபை]", speaker: "[Speaker A]", bodyMd: "[விசுவாசம்]" }),
    sermon({ id: "3", title: "[Hope]", speaker: "[Speaker A]", summary: "[grace and peace]" }),
  ];

  it("reads the URL safely", () => {
    expect(readSermonFilter({ q: ["  grace ", "x"], speaker: undefined })).toEqual({ q: "grace", speaker: "" });
    expect(readSermonFilter({ q: "x".repeat(500) }).q).toHaveLength(100);
  });

  it("matches every word in title, summary, text, speaker or reference, case-insensitively, Tamil included", () => {
    expect(filterSermons(items, { q: "GRACE", speaker: "" }, "en").map((s) => s.id)).toEqual(["1", "3"]);
    expect(filterSermons(items, { q: "grace john", speaker: "" }, "en").map((s) => s.id)).toEqual(["1"]);
    expect(filterSermons(items, { q: "விசுவாசம்", speaker: "" }, "ta").map((s) => s.id)).toEqual(["2"]);
    expect(filterSermons(items, { q: "", speaker: "[Speaker A]" }, "en").map((s) => s.id)).toEqual(["2", "3"]);
    expect(filterSermons(items, { q: "grace", speaker: "[Speaker A]" }, "en").map((s) => s.id)).toEqual(["3"]);
    expect(filterSermons(items, { q: "nothing", speaker: "" }, "en")).toEqual([]);
  });

  it("lists distinct speakers once, sorted", () => {
    expect(speakersOf(items, "en")).toEqual(["[Speaker A]", "[Speaker B]"]);
  });

  it("paginates with clamped page numbers", () => {
    const list = Array.from({ length: 23 }, (_, i) => i);
    expect(paginate(list, undefined, 10)).toEqual({ items: list.slice(0, 10), page: 1, totalPages: 3 });
    expect(paginate(list, "3", 10).items).toEqual([20, 21, 22]);
    expect(paginate(list, "99", 10).page).toBe(3);
    expect(paginate(list, "-4", 10).page).toBe(1);
    expect(paginate(list, "abc", 10).page).toBe(1);
    expect(paginate([], "2", 10)).toEqual({ items: [], page: 1, totalPages: 1 });
  });

  it("builds list addresses with only non-default values", () => {
    expect(listQuery({ q: "", speaker: "" }, 1)).toBe("");
    expect(listQuery({ q: "grace", speaker: "[A]" }, 2)).toBe("?q=grace&speaker=%5BA%5D&page=2");
  });

  it("renders previous / status / next and hides itself on a single page", () => {
    const { container } = render(<Pagination locale="en" page={2} totalPages={3} hrefFor={(p) => `/en/sermons?page=${p}`} />);
    expect(screen.getByRole("navigation", { name: t("pagination.label", "en") })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t("pagination.previous", "en") })).toHaveAttribute("href", "/en/sermons?page=1");
    expect(screen.getByRole("link", { name: t("pagination.next", "en") })).toHaveAttribute("href", "/en/sermons?page=3");
    expect(container).toHaveTextContent("Page 2 of 3");
    const single = render(<Pagination locale="ta" page={1} totalPages={1} hrefFor={() => ""} />);
    expect(single.container).toBeEmptyDOMElement();
  });
});

describe("link previews", () => {
  it("adds Open Graph and Twitter tags that match the page title, and keeps noindex", () => {
    const m = pageMetadata("ta", "sermons", { title: "[Sermon]", description: "[Desc]", path: "/sermons/x" });
    expect(m.openGraph).toMatchObject({ type: "website", title: "[Sermon] · NLTAG", description: "[Desc]", url: "/ta/sermons/x" });
    expect(m.twitter).toMatchObject({ card: "summary", title: "[Sermon] · NLTAG" });
    expect(m.robots).toEqual({ index: false, follow: false });
    expect(m.alternates?.canonical).toBe("/ta/sermons/x");
  });
});
