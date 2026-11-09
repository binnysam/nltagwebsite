// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { STAFF_ROLES } from "@/server/db/schema/access";
import { renderEmail } from "@/server/email/templates";
import { resetServerEnvForTests, serverEnv } from "@/server/env";
import { can, PERMISSIONS, permissionsFor, type Permission, type Principal } from "@/server/policy/permissions";
import { redact } from "@/server/security/log";

const visitor: Principal = { kind: "visitor" };
const member: Principal = { kind: "user", userId: "m", emailVerified: true, roles: [], twoFactorEnabled: true };
const editor: Principal = { kind: "user", userId: "e", emailVerified: true, roles: ["CONTENT_EDITOR"], twoFactorEnabled: true };
const admin: Principal = { kind: "user", userId: "a", emailVerified: true, roles: ["CHURCH_ADMIN"], twoFactorEnabled: true };
const prayerTeam: Principal = { kind: "user", userId: "p", emailVerified: true, roles: ["PRAYER_TEAM"], twoFactorEnabled: true };
const unverifiedAdmin: Principal = { kind: "user", userId: "u", emailVerified: false, roles: ["CHURCH_ADMIN"], twoFactorEnabled: true };

/** Architecture §5, written out independently of the implementation. */
const EXPECTED: Record<"visitor" | "member" | "editor" | "prayerTeam" | "admin", readonly Permission[]> = {
  visitor: ["content.read_published"],
  member: ["content.read_published", "account.manage_own", "membership.own"],
  editor: [
    "content.read_published", "account.manage_own", "membership.own", "admin.access", "staff.portal", "content.draft.edit", "content.submit_for_review", "media.upload",
    // Nov 2026: testimony submissions (text only, no contact details), accept as draft
    "submission.read", "submission.decide",
  ],
  // Nov 2026 (owner requirement): prayer requests only; no CMS, no contact messages, no submissions.
  prayerTeam: ["content.read_published", "account.manage_own", "membership.own", "staff.portal", "prayer.read", "prayer.manage"],
  admin: [
    "content.read_published", "account.manage_own", "membership.own", "admin.access", "staff.portal", "content.draft.edit", "content.publish", "media.upload",
    "membership.read_any", "membership.decide", "membership.birthdays", "membership.reports", "membership.export", "staff.manage", "audit.read",
    "prayer.read", "prayer.manage", "prayer.delete", "contact.read", "contact.manage", "submission.read", "submission.decide", "submission.contact", "gallery.publish",
  ],
};

describe("permission matrix (architecture §5)", () => {
  it.each([
    ["visitor", visitor],
    ["member", member],
    ["editor", editor],
    ["prayerTeam", prayerTeam],
    ["admin", admin],
  ] as const)("%s has exactly the approved permissions", (name, principal) => {
    expect([...permissionsFor(principal)].sort()).toEqual([...EXPECTED[name]].sort());
  });

  it("Content Editor can never publish or see membership data", () => {
    for (const p of PERMISSIONS.filter((x) => x.startsWith("membership.") && x !== "membership.own")) expect(can(editor, p)).toBe(false);
    expect(can(editor, "content.publish")).toBe(false);
    expect(can(editor, "staff.manage")).toBe(false);
  });

  it("Content Editors never read prayer requests or contact messages, nor submitters' contact details", () => {
    for (const p of ["prayer.read", "prayer.manage", "prayer.delete", "contact.read", "contact.manage", "submission.contact", "gallery.publish"] as const) expect(can(editor, p), p).toBe(false);
  });

  it("Prayer Team reads prayer requests only: no CMS, contact, submissions, staff or audit", () => {
    for (const p of PERMISSIONS.filter((x) => !["content.read_published", "account.manage_own", "membership.own", "staff.portal", "prayer.read", "prayer.manage"].includes(x))) {
      expect(can(prayerTeam, p), p).toBe(false);
    }
    expect(can({ ...prayerTeam, twoFactorEnabled: false } as Principal, "prayer.read")).toBe(false);
  });

  it("visitors and members never get any inbox permission", () => {
    for (const who of [visitor, member]) for (const p of PERMISSIONS.filter((x) => /^(prayer|contact|submission|gallery)\./.test(x))) expect(can(who, p), p).toBe(false);
  });

  it("an unverified email removes every staff permission", () => {
    expect([...permissionsFor(unverifiedAdmin)].sort()).toEqual(["account.manage_own", "content.read_published"]);
  });

  it("only the approved staff roles exist (Gate 0 two + Prayer Team, Nov 2026)", () => {
    expect([...STAFF_ROLES]).toEqual(["CHURCH_ADMIN", "CONTENT_EDITOR", "PRAYER_TEAM"]);
  });
});

describe("account emails", () => {
  const url = "https://example.test/api/auth/verify-email?token=abc&callbackURL=%2Fta";

  it("are bilingual with Tamil first, and carry the link in text and HTML", () => {
    for (const kind of ["verify", "reset"] as const) {
      const m = renderEmail(kind, url);
      expect(m.text.indexOf("செல்லுபடியாகும்")).toBeLessThan(m.text.indexOf("It works for"));
      expect(m.text).toContain(url);
      expect(m.html).toContain('lang="ta"');
      expect(m.html).toContain("&amp;callbackURL");
      expect(m.html).not.toMatch(/<img|<script|https?:\/\/(?!example\.test)/);
    }
  });

  it("escape anything that could inject HTML", () => {
    const m = renderEmail("verify", 'https://example.test/x?"><script>alert(1)</script>');
    expect(m.html).not.toContain("<script>");
  });

  it("refuse non-http links", () => {
    expect(() => renderEmail("reset", "javascript:alert(1)")).toThrow();
  });

  it("name the church from the confirmed identity only", () => {
    const m = renderEmail("verify", url);
    expect(m.text).toContain("New Life Tamil AG Church");
    expect(m.text).not.toContain("{church}");
  });
});

describe("log redaction", () => {
  it("masks emails, tokens, passwords and sensitive keys", () => {
    const out = JSON.stringify(
      redact({ email: "a@b.test", note: "contact a@b.test", password: "x", token: "y", dob: "2018-01-01", detail: "token abcdefghijklmnopqrstuvwxyz0123" }),
    );
    expect(out).not.toMatch(/a@b\.test|abcdefghijklmnop|2018-01-01/);
  });
});

describe("server environment validation", () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
    resetServerEnvForTests();
  });
  const base = { DATABASE_URL: "mysql://u:p@127.0.0.1:3306/db", BETTER_AUTH_SECRET: "x".repeat(40), BETTER_AUTH_URL: "http://localhost:3000" };

  it("rejects a short secret without echoing values", () => {
    Object.assign(process.env, base, { BETTER_AUTH_SECRET: "short-secret-value" });
    expect(() => serverEnv()).toThrow(/BETTER_AUTH_SECRET/);
    try { serverEnv(); } catch (e) { expect(String(e)).not.toContain("short-secret-value"); }
  });

  it("requires https and rate limiting in production", () => {
    Object.assign(process.env, base, { NODE_ENV: "production", AUTH_RATE_LIMIT: "off", BETTER_AUTH_URL: "http://nltag.example" });
    expect(() => serverEnv()).toThrow(/https[\s\S]*Rate limiting|Rate limiting[\s\S]*https/);
  });

  it("requires SMTP and Google settings as complete sets", () => {
    Object.assign(process.env, base, { SMTP_HOST: "smtp.gmail.com", GOOGLE_CLIENT_ID: "id-only" });
    expect(() => serverEnv()).toThrow(/SMTP[\s\S]*GOOGLE|GOOGLE[\s\S]*SMTP/);
  });
});

describe("migrations", () => {
  const files = readdirSync("drizzle").filter((f) => f.endsWith(".sql")).sort();

  it("are committed SQL files with a journal entry each", () => {
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as { entries: { tag: string }[] };
    expect(journal.entries.map((e) => `${e.tag}.sql`)).toEqual(files);
  });

  it("set the Unicode collation before creating any table", () => {
    const first = readFileSync(`drizzle/${files[0]}`, "utf8");
    expect(first.indexOf("utf8mb4_uca1400_ai_ci")).toBeLessThan(first.indexOf("CREATE TABLE"));
  });

  it("package scripts never use drizzle-kit push or introspect", () => {
    const pkg = readFileSync("package.json", "utf8");
    expect(pkg).not.toMatch(/drizzle-kit (push|introspect|pull)/);
  });
});
