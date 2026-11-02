import { render } from "@testing-library/react";
import { schedule } from "@/content/schedule";
import { kuwaitLocalToUtc, utcToKuwaitLocal } from "@/lib/date";
import { Markdown, safeHref } from "@/lib/markdown";
import { upcomingOccurrences } from "@/lib/schedule-occurrences";
import type { Principal } from "@/server/policy/permissions";
import { canPerform, displayStatus, isPubliclyVisible, pickDailyVerse, type ContentAction, type ItemState } from "@/server/cms/rules";
import { parseContentForm, slugSchema, translationPermissionSchema } from "@/server/cms/schemas";

const admin: Principal = { kind: "user", userId: "a", emailVerified: true, roles: ["CHURCH_ADMIN"] };
const editor: Principal = { kind: "user", userId: "e", emailVerified: true, roles: ["CONTENT_EDITOR"] };
const member: Principal = { kind: "user", userId: "m", emailVerified: true, roles: [] };
const unverifiedAdmin: Principal = { kind: "user", userId: "u", emailVerified: false, roles: ["CHURCH_ADMIN"] };
const visitor: Principal = { kind: "visitor" };

const item = (status: ItemState["status"], extra: Partial<ItemState> = {}): ItemState => ({ type: "ANNOUNCEMENT", status, deleted: false, ...extra });

function form(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

describe("CMS workflow rules (server-enforced)", () => {
  const actions: ContentAction[] = ["edit", "submit", "publish", "unpublish", "archive", "return_to_draft", "delete", "restore"];

  it("visitors, members and unverified staff can do nothing", () => {
    for (const p of [visitor, member, unverifiedAdmin]) for (const a of actions) expect(canPerform(p, item("DRAFT"), a)).toBe(false);
  });

  it("Content Editor: edit drafts and items in review, submit drafts; never publish, unpublish, archive or delete", () => {
    expect(canPerform(editor, item("DRAFT"), "edit")).toBe(true);
    expect(canPerform(editor, item("IN_REVIEW"), "edit")).toBe(true);
    expect(canPerform(editor, item("PUBLISHED"), "edit")).toBe(false);
    expect(canPerform(editor, item("ARCHIVED"), "edit")).toBe(false);
    expect(canPerform(editor, item("DRAFT"), "submit")).toBe(true);
    expect(canPerform(editor, item("IN_REVIEW"), "submit")).toBe(false);
    for (const a of ["publish", "unpublish", "archive", "return_to_draft", "delete", "restore"] as const) {
      for (const s of ["DRAFT", "IN_REVIEW", "PUBLISHED", "ARCHIVED"] as const) expect(canPerform(editor, item(s), a)).toBe(false);
    }
  });

  it("Church Admin: full workflow", () => {
    expect(canPerform(admin, item("DRAFT"), "publish")).toBe(true);
    expect(canPerform(admin, item("IN_REVIEW"), "publish")).toBe(true);
    expect(canPerform(admin, item("PUBLISHED"), "publish")).toBe(false);
    expect(canPerform(admin, item("PUBLISHED"), "unpublish")).toBe(true);
    expect(canPerform(admin, item("PUBLISHED"), "edit")).toBe(true);
    expect(canPerform(admin, item("IN_REVIEW"), "return_to_draft")).toBe(true);
    expect(canPerform(admin, item("DRAFT"), "delete")).toBe(true);
    expect(canPerform(admin, item("DRAFT", { deleted: true }), "restore")).toBe(true);
    expect(canPerform(admin, item("DRAFT", { deleted: true }), "edit")).toBe(false);
  });

  it("a testimony cannot be published without granted permission", () => {
    const t = (p: ItemState["testimonyPermission"]) => item("IN_REVIEW", { type: "TESTIMONY", testimonyPermission: p });
    expect(canPerform(admin, t("NOT_RECORDED"), "publish")).toBe(false);
    expect(canPerform(admin, t("WITHDRAWN"), "publish")).toBe(false);
    expect(canPerform(admin, t("GRANTED"), "publish")).toBe(true);
  });
});

describe("public visibility", () => {
  const now = new Date("2026-11-06T10:00:00Z");
  const base = { type: "ANNOUNCEMENT" as const, status: "PUBLISHED" as const, deletedAt: null, publishAt: null, expiresAt: null };

  it("shows only published, live, non-deleted items", () => {
    expect(isPubliclyVisible(base, now)).toBe(true);
    for (const status of ["DRAFT", "IN_REVIEW", "ARCHIVED"] as const) expect(isPubliclyVisible({ ...base, status }, now)).toBe(false);
    expect(isPubliclyVisible({ ...base, deletedAt: now }, now)).toBe(false);
  });

  it("respects scheduled publication and expiry", () => {
    expect(isPubliclyVisible({ ...base, publishAt: new Date("2026-11-07T00:00:00Z") }, now)).toBe(false);
    expect(displayStatus({ ...base, publishAt: new Date("2026-11-07T00:00:00Z") }, now)).toBe("Scheduled");
    expect(isPubliclyVisible({ ...base, expiresAt: now }, now)).toBe(false);
    expect(displayStatus({ ...base, expiresAt: now }, now)).toBe("Expired");
  });

  it("hides testimonies without granted permission even when published", () => {
    expect(isPubliclyVisible({ ...base, type: "TESTIMONY", testimonyPermission: "WITHDRAWN" }, now)).toBe(false);
    expect(isPubliclyVisible({ ...base, type: "TESTIMONY", testimonyPermission: "GRANTED" }, now)).toBe(true);
  });
});

describe("deterministic daily verse", () => {
  const verses = [{ id: "c" }, { id: "a" }, { id: "b" }];
  it("is stable for a date and independent of input order", () => {
    const a = pickDailyVerse("2026-11-06", verses);
    expect(pickDailyVerse("2026-11-06", [...verses].reverse())).toEqual(a);
    const picks = new Set(["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"].map((d) => pickDailyVerse(d, verses)!.id));
    expect(picks.size).toBeGreaterThan(1);
  });
  it("uses the scheduled verse when it is published, else falls back", () => {
    expect(pickDailyVerse("2026-11-06", verses, "b")!.id).toBe("b");
    expect(pickDailyVerse("2026-11-06", verses, "missing")).not.toBeNull();
    expect(pickDailyVerse("2026-11-06", [])).toBeNull();
  });
});

describe("Kuwait time", () => {
  it("converts Kuwait wall-clock input to UTC and back (UTC+3, no daylight saving)", () => {
    expect(kuwaitLocalToUtc("2026-11-06T19:30")!.toISOString()).toBe("2026-11-06T16:30:00.000Z");
    expect(kuwaitLocalToUtc("2026-07-01T00:30")!.toISOString()).toBe("2026-06-30T21:30:00.000Z");
    expect(utcToKuwaitLocal(new Date("2026-11-06T16:30:00Z"))).toBe("2026-11-06T19:30");
    expect(kuwaitLocalToUtc("2026-02-31T10:00")).toBeNull();
    expect(kuwaitLocalToUtc("tomorrow")).toBeNull();
  });

  it("lists the Gate 0 meetings of the coming week in Kuwait time", () => {
    // Thursday 26 Nov 2026 08:00 Kuwait = last Thursday of November.
    const now = new Date("2026-11-26T05:00:00Z");
    const occ = upcomingOccurrences(schedule, now, 7);
    const ids = occ.map((o) => o.itemId);
    expect(ids[0]).toBe("ladies-meeting");
    expect(occ[0]!.startsAt.toISOString()).toBe("2026-11-26T16:00:00.000Z"); // 19:00 Kuwait
    expect(ids).toEqual(["ladies-meeting", "main-worship", "sunday-school", "fasting-prayer", "cottage-meeting"]);
    // Sunday School is on Friday.
    const ss = occ.find((o) => o.itemId === "sunday-school")!;
    expect(new Date(ss.startsAt.getTime() + 3 * 3600_000).getUTCDay()).toBe(5);
    // No Ladies Meeting on a Thursday that is not the last of the month.
    expect(upcomingOccurrences(schedule, new Date("2026-11-19T05:00:00Z"), 1).map((o) => o.itemId)).not.toContain("ladies-meeting");
  });
});

describe("content validation", () => {
  it("accepts Tamil and English, normalising Tamil to NFC", () => {
    const decomposed = "தமிழ்".normalize("NFD");
    const r = parseContentForm("ANNOUNCEMENT", form({ "ta.title": decomposed, "en.title": "Test title", "ta.bodyMd": "சோதனை உரை", "en.bodyMd": "" }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.ta.title).toBe("தமிழ்".normalize("NFC"));
      expect(r.data.ta.bodyMd).toBe("சோதனை உரை");
    }
  });

  it("requires a title in at least one language", () => {
    const r = parseContentForm("ANNOUNCEMENT", form({}));
    expect(r).toMatchObject({ ok: false, errors: { "ta.title": expect.any(String) } });
  });

  it("rejects raw HTML and unsafe links anywhere", () => {
    for (const [field, value] of [
      ["en.bodyMd", "<script>alert(1)</script>"],
      ["en.bodyMd", 'Hello <img src=x onerror="alert(1)">'],
      ["en.title", "<b>Bold</b>"],
      ["en.bodyMd", "[click](javascript:alert(1))"],
      ["en.bodyMd", "[x](data:text/html;base64,PHNjcmlwdD4=)"],
      ["en.bodyMd", "[x](//evil.example)"],
    ] as const) {
      const r = parseContentForm("ANNOUNCEMENT", form({ "en.title": "T", [field]: value }));
      expect(r.ok, `${field}: ${value}`).toBe(false);
    }
    expect(parseContentForm("ANNOUNCEMENT", form({ "en.title": "T", "en.bodyMd": "See [our page](/en) or [site](https://example.org). 3 < 4" })).ok).toBe(true);
  });

  it("validates page slugs and reserves site routes", () => {
    expect(slugSchema.safeParse("about-us").success).toBe(true);
    for (const bad of ["About Us", "a--b", "admin", "sign-in", "தமிழ்", "../x"]) expect(slugSchema.safeParse(bad).success, bad).toBe(false);
    expect(parseContentForm("PAGE", form({ "en.title": "T" }))).toMatchObject({ ok: false, errors: { slug: expect.any(String) } });
  });

  it("never accepts an address for members' homes or NECK, and needs a place name for OTHER", () => {
    const ev = (kind: string, text: string) => parseContentForm("EVENT", form({ "en.title": "T", "detail.startsAt": "2026-11-20T19:00", "detail.locationKind": kind, "detail.locationText": text }));
    expect(ev("MEMBERS_HOMES", "Block 4, Street 12")).toMatchObject({ ok: false, errors: { "detail.locationText": expect.stringMatching(/home address/) } });
    expect(ev("NECK", "Somewhere")).toMatchObject({ ok: false });
    expect(ev("OTHER", "")).toMatchObject({ ok: false });
    expect(ev("NECK", "").ok).toBe(true);
    const ok = ev("OTHER", "[Placeholder hall]");
    expect(ok.ok && (ok.data.detail as { startsAt: Date }).startsAt.toISOString()).toBe("2026-11-20T16:00:00.000Z");
  });

  it("needs an end after the start and an expiry after publication", () => {
    expect(parseContentForm("EVENT", form({ "en.title": "T", "detail.startsAt": "2026-11-20T19:00", "detail.endsAt": "2026-11-20T18:00" })).ok).toBe(false);
    expect(parseContentForm("ANNOUNCEMENT", form({ "en.title": "T", publishAt: "2026-11-20T19:00", expiresAt: "2026-11-19T19:00" })).ok).toBe(false);
  });

  it("only accepts https video links", () => {
    expect(parseContentForm("SERMON", form({ "en.title": "T", "detail.videoUrl": "http://youtube.com/x" })).ok).toBe(false);
    expect(parseContentForm("SERMON", form({ "en.title": "T", "detail.videoUrl": "javascript:alert(1)" })).ok).toBe(false);
    expect(parseContentForm("SERMON", form({ "en.title": "T", "detail.videoUrl": "https://www.youtube.com/watch?v=test" })).ok).toBe(true);
  });

  it("anonymous testimonies drop the display name; named ones need it", () => {
    const named = parseContentForm("TESTIMONY", form({ "en.title": "T", "detail.authorDisplayName": "" }));
    expect(named.ok).toBe(false);
    const anon = parseContentForm("TESTIMONY", form({ "en.title": "T", "detail.anonymous": "on", "detail.authorDisplayName": "Someone" }));
    expect(anon.ok && anon.data.detail).toMatchObject({ anonymous: true, authorDisplayName: "" });
  });

  it("ignores fields a module does not support (no scheduling or featuring pages)", () => {
    const r = parseContentForm("PAGE", form({ "en.title": "T", slug: "about", featured: "on", publishAt: "2026-11-20T19:00" }));
    expect(r.ok && [r.data.featured, r.data.publishAt]).toEqual([false, null]);
  });

  it("accepts translation permission input", () => {
    expect(translationPermissionSchema.safeParse({ translationId: "bsi-ta", verified: "on", creditLine: "x", permissionReference: "y" }).success).toBe(true);
    expect(translationPermissionSchema.safeParse({ translationId: "kjv", verified: "on", creditLine: "x", permissionReference: "y" }).success).toBe(false);
  });
});

describe("safe Markdown rendering", () => {
  it("renders supported Markdown as elements", () => {
    const { container } = render(<Markdown source={"## Heading\n\nSome **bold** and *italic* text with a [link](https://example.org).\n\n- one\n- two"} />);
    expect(container.querySelector("h2")?.textContent).toBe("Heading");
    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect(container.querySelector("a")?.getAttribute("href")).toBe("https://example.org/");
    expect(container.querySelector("a")?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(container.querySelectorAll("li")).toHaveLength(2);
  });

  it("shows HTML as text and never creates script, image or event-handler elements", () => {
    const payloads = ['<script>alert(1)</script>', '<img src=x onerror="alert(1)">', '"><svg onload=alert(1)>', "<iframe src=//evil></iframe>"];
    const { container } = render(<Markdown source={payloads.join("\n\n")} />);
    expect(container.querySelector("script, img, svg, iframe")).toBeNull();
    expect(container.innerHTML).not.toMatch(/<(script|img|svg|iframe)/i);
    expect(container.textContent).toContain("<script>alert(1)</script>");
    for (const el of container.querySelectorAll("*")) for (const a of el.attributes) expect(a.name.startsWith("on")).toBe(false);
  });

  it("drops dangerous link targets", () => {
    for (const href of ["javascript:alert(1)", "data:text/html,x", "vbscript:x", "//evil.example", " JaVaScRiPt:alert(1)"]) expect(safeHref(href)).toBeNull();
    const { container } = render(<Markdown source="[click](javascript:alert(1))" />);
    expect(container.querySelector("a")).toBeNull();
  });

  it("renders Tamil text unchanged", () => {
    const { container } = render(<Markdown source="சோதனை **உரை**" />);
    expect(container.textContent).toBe("சோதனை உரை");
  });
});
