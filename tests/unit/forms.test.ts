// @vitest-environment node
// Public forms (Nov 2026): validation, spam token, encryption at rest, notification privacy,
// YouTube parsing, and the rule that only src/server/forms touches the submission tables.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { parseContact, parsePrayer, parseTestimony, displayNameFor, clean } from "@/server/forms/validation";
import { checkFormToken, contentHash, issueFormToken, MIN_FILL_MS, MAX_AGE_MS } from "@/server/forms/protection";
import { dataKeyConfigured, decryptText, encryptText } from "@/server/forms/crypto";
import { renderNotification } from "@/server/forms/notify";
import { formAvailable, publicFormsEnabled } from "@/server/forms/service";
import { youTubeId, youTubeEmbedUrl } from "@/lib/youtube";
import { resetServerEnvForTests } from "@/server/env";

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

const saved = { ...process.env };
beforeEach(() => {
  process.env = {
    ...saved,
    NODE_ENV: "test",
    DATABASE_URL: "mysql://u:p@127.0.0.1:3306/nltag_test",
    BETTER_AUTH_SECRET: "test-only-secret-not-used-anywhere-else-0123456789",
    BETTER_AUTH_URL: "http://localhost:3000",
    NLTAG_DATA_KEY: "a".repeat(64),
  };
  resetServerEnvForTests();
});
afterEach(() => {
  process.env = { ...saved };
  resetServerEnvForTests();
});

describe("prayer form validation", () => {
  it("accepts an anonymous request with consent", () => {
    const r = parsePrayer(fd({ body: "Please pray for my family's health.", consent: "on" }));
    expect(r.ok).toBe(true);
  });
  it("requires the request text (10–2000), consent, and contact when contact is requested", () => {
    const r = parsePrayer(fd({ body: "short", contactRequested: "on" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toEqual({ body: "form.error.tooShort", consent: "form.error.consent", contact: "form.errorRequired" });
    const long = parsePrayer(fd({ body: "x".repeat(2001), consent: "on" }));
    expect(!long.ok && long.errors.body).toBe("form.error.tooLong");
  });
  it("refuses HTML and more than two links", () => {
    expect(parsePrayer(fd({ body: "<script>alert(1)</script> please pray", consent: "on" }))).toMatchObject({ ok: false, errors: { body: "form.error.html" } });
    expect(parsePrayer(fd({ body: "see https://a.example https://b.example www.c.example", consent: "on" }))).toMatchObject({ ok: false, errors: { body: "form.error.links" } });
  });
  it("accepts an email or a phone number as contact, nothing else", () => {
    expect(parsePrayer(fd({ body: "Please pray for us all.", consent: "on", contact: "+965 1234 5678" })).ok).toBe(true);
    expect(parsePrayer(fd({ body: "Please pray for us all.", consent: "on", contact: "a@nltag.test" })).ok).toBe(true);
    expect(parsePrayer(fd({ body: "Please pray for us all.", consent: "on", contact: "call me" }))).toMatchObject({ ok: false, errors: { contact: "form.error.contact" } });
  });
  it("normalises Tamil to NFC and strips control characters", () => {
    expect(clean("தமிழ்\u0007 ".normalize("NFD"))).toBe("தமிழ்".normalize("NFC"));
  });
});

describe("contact form validation (Name, Email, optional Phone, Subject, Message)", () => {
  const ok = { name: "Test Visitor", email: "visitor@nltag.test", subject: "Question", message: "When is the Friday service?" };
  it("accepts the approved fields with phone optional", () => {
    expect(parseContact(fd(ok)).ok).toBe(true);
    expect(parseContact(fd({ ...ok, phone: "+965 2222 3333" })).ok).toBe(true);
  });
  it("requires name, a valid email, subject and message", () => {
    const r = parseContact(fd({ email: "nope" }));
    expect(!r.ok && r.errors).toEqual({ name: "form.errorRequired", email: "form.error.email", subject: "form.errorRequired", message: "form.errorRequired" });
    expect(parseContact(fd({ ...ok, phone: "abc" }))).toMatchObject({ ok: false, errors: { phone: "form.error.phone" } });
  });
});

describe("testimony submission validation", () => {
  const ok = { title: "Healing", body: "God healed me after a long illness and I want to thank Him.", display: "FIRST_NAME", name: "Test Person", consentPublish: "on", consentOthers: "on" };
  it("needs both consents and a name unless anonymous", () => {
    expect(parseTestimony(fd(ok)).ok).toBe(true);
    const r = parseTestimony(fd({ ...ok, consentPublish: "", consentOthers: "", name: "" }));
    expect(!r.ok && r.errors).toEqual({ name: "form.errorRequired", consentPublish: "form.error.consent", consentOthers: "form.error.consent" });
    expect(parseTestimony(fd({ ...ok, display: "ANONYMOUS", name: "" })).ok).toBe(true);
  });
  it("an unknown display choice falls back to anonymous; the public name follows the choice", () => {
    const r = parseTestimony(fd({ ...ok, display: "EVERYTHING" }));
    expect(r.ok && r.data.display).toBe("ANONYMOUS");
    expect(displayNameFor("FULL_NAME", "Test Person")).toBe("Test Person");
    expect(displayNameFor("FIRST_NAME", "Test Person")).toBe("Test");
    expect(displayNameFor("ANONYMOUS", "Test Person")).toBe("");
  });
});

describe("signed form token", () => {
  it("is accepted between the minimum fill time and the maximum age, for its own form only", () => {
    const t0 = 1_800_000_000_000;
    const token = issueFormToken("prayer", t0);
    expect(checkFormToken("prayer", token, t0 + MIN_FILL_MS - 1)).toBe("too-fast");
    expect(checkFormToken("prayer", token, t0 + MIN_FILL_MS)).toBe("ok");
    expect(checkFormToken("prayer", token, t0 + MAX_AGE_MS + 1)).toBe("expired");
    expect(checkFormToken("contact", token, t0 + 10_000)).toBe("invalid");
    expect(checkFormToken("prayer", token.replace(/.$/, (c) => (c === "A" ? "B" : "A")), t0 + 10_000)).toBe("invalid");
    expect(checkFormToken("prayer", `${t0 - 60_000}.${token.split(".")[1]}`, t0)).toBe("invalid");
    expect(checkFormToken("prayer", null, t0)).toBe("invalid");
  });
  it("duplicate fingerprints ignore case and spacing but not content", () => {
    expect(contentHash("prayer", ["Please  pray\nfor me"])).toBe(contentHash("prayer", ["please pray for me"]));
    expect(contentHash("prayer", ["please pray for me"])).not.toBe(contentHash("prayer", ["please pray for us"]));
    expect(contentHash("prayer", ["x"])).not.toBe(contentHash("contact", ["x"]));
  });
});

describe("encryption at rest (prayer requests)", () => {
  it("round-trips, never stores plain text, and uses a fresh IV each time", () => {
    const a = encryptText("பிரார்த்தனை: my request");
    const b = encryptText("பிரார்த்தனை: my request");
    expect(a).not.toContain("request");
    expect(a).not.toBe(b);
    expect(decryptText(a)).toBe("பிரார்த்தனை: my request");
    expect(encryptText("")).toBe("");
  });
  it("a different key (another deployment) cannot read it, and tampering is detected", () => {
    const stored = encryptText("secret");
    process.env.NLTAG_DATA_KEY = "b".repeat(64);
    expect(() => decryptText(stored)).toThrow();
    process.env.NLTAG_DATA_KEY = "a".repeat(64);
    const parts = stored.split(".");
    parts[3] = parts[3]!.replace(/^./, (c) => (c === "A" ? "B" : "A"));
    expect(() => decryptText(parts.join("."))).toThrow();
  });
  it("without a valid key the prayer form is unavailable (fail closed)", () => {
    expect(dataKeyConfigured({ NLTAG_DATA_KEY: "short" })).toBe(false);
    expect(formAvailable("prayer", { NLTAG_PUBLIC_FORMS: "1" })).toBe(false);
    expect(formAvailable("prayer", { NLTAG_PUBLIC_FORMS: "1", NLTAG_DATA_KEY: "c".repeat(64) })).toBe(true);
    expect(formAvailable("contact", { NLTAG_PUBLIC_FORMS: "1" })).toBe(true);
    expect(publicFormsEnabled({})).toBe(false);
    expect(formAvailable("contact", {})).toBe(false);
  });
});

describe("staff notifications", () => {
  it("prayer and testimony notices carry no submitted content", () => {
    for (const form of ["prayer", "testimony"] as const) {
      const m = renderNotification(form, "id-1", { body: "SENSITIVE TEXT", name: "SENSITIVE NAME" });
      expect(`${m.subject}${m.text}${m.html}`).not.toMatch(/SENSITIVE|id-1/);
      expect(m.text).toContain(form === "prayer" ? "/admin/prayer" : "/admin/testimony-submissions");
    }
  });
  it("the contact message is included and HTML-escaped", () => {
    const m = renderNotification("contact", "id", { name: "<b>X</b>", email: "x@nltag.test", subject: "S", message: "Hello <script>" });
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.text).toContain("Hello <script>");
  });
});

describe("YouTube links", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?t=10", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/live/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ&feature=share", "dQw4w9WgXcQ"],
    ["https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ])("%s → %s", (url, id) => expect(youTubeId(url)).toBe(id));
  it.each(["https://evil.example/watch?v=dQw4w9WgXcQ", "javascript:alert(1)", "https://www.youtube.com/watch?v=short", "https://vimeo.com/123", "", null])("rejects %s", (url) => {
    expect(youTubeId(url)).toBeNull();
  });
  it("embeds only from the privacy-enhanced domain", () => {
    expect(youTubeEmbedUrl("dQw4w9WgXcQ")).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?/);
  });
});

describe("submission tables are reached only through their services", () => {
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
      const p = path.join(dir, n);
      return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
    });
  }
  it("only src/server/forms imports prayerRequest/contactMessage/testimonySubmission; only src/server/gallery imports galleryPhoto", () => {
    const offenders: string[] = [];
    for (const f of files("src")) {
      if (f.includes(`${path.sep}db${path.sep}schema${path.sep}`)) continue;
      const text = readFileSync(f, "utf8");
      if (/\b(prayerRequest|contactMessage|testimonySubmission)\b/.test(text) && !f.startsWith(path.join("src", "server", "forms"))) offenders.push(f);
      if (/\bgalleryPhoto\b/.test(text) && !f.startsWith(path.join("src", "server", "gallery"))) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
  it("no public page or route imports the staff inbox functions", () => {
    const staffFns = /\b(listPrayer|getPrayer|setPrayerStatus|deletePrayer|listContact|getContact|listTestimonySubmissions|getTestimonySubmission)\b/;
    const offenders = files(path.join("src", "app")).filter((f) => !f.startsWith(path.join("src", "app", "admin")) && staffFns.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
