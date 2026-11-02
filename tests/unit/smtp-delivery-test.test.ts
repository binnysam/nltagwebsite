// @vitest-environment node
// TEMPORARY — remove with src/server/email/smtp-delivery-test.ts (SMTP Stage A).
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  CHURCH_MAILBOX,
  describeOutcome,
  describeRecipient,
  exitCodeFor,
  parseSmtpTestRequest,
  renderSmtpTestEmail,
  runSmtpDeliveryTest,
  type SmtpTestDeps,
} from "@/server/email/smtp-delivery-test";

const FAKE_PASS = "fake-app-password-for-tests";
const approvedEnv = (over: Record<string, string | undefined> = {}) => ({
  NODE_ENV: "production",
  NLTAG_APPROVED_SMTP_TEST: "1",
  NLTAG_SMTP_TEST_TO: "newlifetamilassembly+webtest@gmail.com",
  NLTAG_SMTP_TEST_RUN_ID: "stage-a-1",
  NLTAG_ACCOUNTS_ENABLED: "0",
  SMTP_HOST: "smtp.gmail.com",
  SMTP_PORT: "465",
  SMTP_USER: CHURCH_MAILBOX,
  SMTP_PASS: FAKE_PASS,
  SMTP_FROM: `New Life Tamil AG Church <${CHURCH_MAILBOX}>`,
  BETTER_AUTH_URL: "https://nltagkuwait.com",
  ...over,
});

describe("parseSmtpTestRequest — authorization (fail closed)", () => {
  it("does nothing unless NLTAG_APPROVED_SMTP_TEST is exactly 1", () => {
    for (const v of [undefined, "", "0", "true", "yes", "11"]) {
      expect(parseSmtpTestRequest(approvedEnv({ NLTAG_APPROVED_SMTP_TEST: v }))).toEqual({ status: "not-requested" });
    }
  });
  it("approves the complete, correct configuration", () => {
    expect(parseSmtpTestRequest(approvedEnv())).toEqual({
      status: "approved",
      to: "newlifetamilassembly+webtest@gmail.com",
      runId: "stage-a-1",
    });
  });
  it("refuses outside production", () => {
    expect(parseSmtpTestRequest(approvedEnv({ NODE_ENV: "development" })).status).toBe("refused");
    expect(parseSmtpTestRequest(approvedEnv({ NODE_ENV: undefined })).status).toBe("refused");
  });
  it("refuses when the accounts gate is open (Stage A is gate-closed only)", () => {
    expect(parseSmtpTestRequest(approvedEnv({ NLTAG_ACCOUNTS_ENABLED: "1" }))).toMatchObject({ status: "refused", reason: expect.stringContaining("accounts gate") });
  });
  it("refuses to share a build with a production migration", () => {
    expect(parseSmtpTestRequest(approvedEnv({ NLTAG_APPROVED_PRODUCTION_MIGRATION: "1" })).status).toBe("refused");
  });
});

describe("parseSmtpTestRequest — input validation", () => {
  const refused = (over: Record<string, string | undefined>) => parseSmtpTestRequest(approvedEnv(over)).status === "refused";

  it("requires all four SMTP variables", () => {
    for (const k of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"]) expect(refused({ [k]: "" })).toBe(true);
  });
  it("requires the church Gmail account as SMTP_USER", () => {
    expect(refused({ SMTP_USER: "someone@gmail.com" })).toBe(true);
    expect(refused({ SMTP_USER: "NewLifeTamilAssembly@gmail.com" })).toBe(false);
  });
  it("requires the exact church sender", () => {
    expect(refused({ SMTP_FROM: CHURCH_MAILBOX })).toBe(true);
    expect(refused({ SMTP_FROM: `NLTAG <${CHURCH_MAILBOX}>` })).toBe(true);
    expect(refused({ SMTP_FROM: "New Life Tamil AG Church <other@gmail.com>" })).toBe(true);
    expect(refused({ SMTP_FROM: `"New Life Tamil AG Church" <${CHURCH_MAILBOX}>` })).toBe(false);
  });
  it("requires BETTER_AUTH_URL to be exactly https://nltagkuwait.com", () => {
    for (const url of ["http://nltagkuwait.com", "https://www.nltagkuwait.com", "https://nltagkuwait.com.evil.test", "https://nltagkuwait.com/ta", "http://localhost:3000", "not a url", ""]) {
      expect(refused({ BETTER_AUTH_URL: url })).toBe(true);
    }
    expect(refused({ BETTER_AUTH_URL: "https://nltagkuwait.com/" })).toBe(false);
  });
  it("accepts only the church mailbox and its +tag aliases as the recipient", () => {
    expect(refused({ NLTAG_SMTP_TEST_TO: CHURCH_MAILBOX })).toBe(false);
    expect(refused({ NLTAG_SMTP_TEST_TO: " NewLifeTamilAssembly+WebTest@Gmail.com " })).toBe(false);
    for (const to of [
      undefined,
      "",
      "someone@gmail.com",
      "mersheena@example.com",
      "new.life.tamil.assembly@gmail.com",
      "newlifetamilassembly@googlemail.com",
      "newlifetamilassembly@gmail.com.evil.test",
      "newlifetamilassembly@gmail.com, someone@gmail.com",
      "newlifetamilassembly@gmail.com\r\nBcc: someone@gmail.com",
      "New Life <newlifetamilassembly@gmail.com>",
      "newlifetamilassembly+@gmail.com",
      "newlifetamilassembly+a_b@gmail.com",
    ]) {
      expect(refused({ NLTAG_SMTP_TEST_TO: to })).toBe(true);
    }
  });
  it("requires a well-formed run id", () => {
    for (const id of [undefined, "", "ab", "Stage-A", "-stage", "stage a", "x".repeat(41), "../etc", "a/b"]) expect(refused({ NLTAG_SMTP_TEST_RUN_ID: id })).toBe(true);
  });
  it("never echoes the SMTP password in a refusal", () => {
    const r = parseSmtpTestRequest(approvedEnv({ SMTP_USER: "x@gmail.com" }));
    expect(JSON.stringify(r)).not.toContain(FAKE_PASS);
  });
});

describe("runSmtpDeliveryTest", () => {
  let root: string;
  let home: string;
  const appDir = "/home/u1/domains/nltagkuwait.com/hbuilds/versions/abc";
  let sent: Array<{ to: string; subject: string; text: string; html: string }>;
  const deps = (over: Partial<SmtpTestDeps> = {}): SmtpTestDeps => ({
    env: approvedEnv(),
    home,
    appDir,
    transportName: "smtp",
    send: async (m) => { sent.push(m); },
    now: () => new Date("2026-11-02T12:00:00Z"),
    ...over,
  });
  const markerPath = (id = "stage-a-1") => path.join(home, "nltag-data", "ops", `smtp-test-${id}.json`);

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), "nltag-smtp-"));
    home = path.join(root, "home");
    mkdirSync(home);
    sent = [];
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("sends exactly one message: the dedicated bilingual delivery-test email", async () => {
    const out = await runSmtpDeliveryTest(deps());
    expect(out).toEqual({ status: "sent", runId: "stage-a-1", recipient: "church mailbox (+webtest)" });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe("newlifetamilassembly+webtest@gmail.com");
    expect(sent[0]).toMatchObject(renderSmtpTestEmail());
  });

  describe("test email content", () => {
    const m = renderSmtpTestEmail();
    it("identifies itself as an NLTAG website email delivery test, Tamil subject first", () => {
      const [taSubject, enSubject] = m.subject.split(" · ");
      expect(taSubject).toMatch(/[஀-௿]/);
      expect(taSubject).toContain("NLTAG");
      expect(enSubject).toBe("NLTAG website email delivery test");
      expect(m.text).toContain("This is a test message to confirm that emails sent by the New Life Tamil AG Church website are delivered.");
    });
    it("puts the Tamil block first and the English block second, in text and HTML", () => {
      const ta = m.html.indexOf('<div lang="ta">');
      const en = m.html.indexOf('<div lang="en">');
      expect(ta).toBeGreaterThan(-1);
      expect(en).toBeGreaterThan(ta);
      expect(m.text.indexOf("சோதனைச் செய்தி")).toBeGreaterThan(-1);
      expect(m.text.indexOf("சோதனைச் செய்தி")).toBeLessThan(m.text.indexOf("This is a test message"));
    });
    it("is not the verification email: no verify wording, no expiry, no token", () => {
      for (const body of [m.subject, m.text, m.html]) {
        expect(body).not.toMatch(/verif|24 hours|hour|expire|token|password|sign[ -]?(in|up)|ignore this/i);
        expect(body).not.toMatch(/சரிபார்|மணி நேரம்|செல்லுபடி|கடவுச்சொல்|புறக்கணி/);
      }
    });
    it("links only to the website homepages, each labelled as the website", () => {
      const links = [...m.html.matchAll(/href="([^"]+)"/g)].map((x) => x[1]);
      expect(links).toEqual(["https://nltagkuwait.com/ta", "https://nltagkuwait.com/en"]);
      expect(m.html).toContain('இணையதளம்: <a href="https://nltagkuwait.com/ta">');
      expect(m.html).toContain('Website: <a href="https://nltagkuwait.com/en">');
      expect(m.text).toContain("இணையதளம்: https://nltagkuwait.com/ta");
      expect(m.text).toContain("Website: https://nltagkuwait.com/en");
      expect(m.text + m.html).not.toMatch(/[?#&]|localhost|http:\/\//);
    });
    it("is plain: no images, scripts or remote assets", () => {
      expect(m.html).not.toMatch(/<img|<script|<link|src=|style=/i);
    });
  });

  it("does not let the caller override the sender: the transport adds SMTP_FROM, the mail carries none", async () => {
    await runSmtpDeliveryTest(deps());
    expect(Object.keys(sent[0]!).sort()).toEqual(["html", "subject", "text", "to"]);
  });

  it("records a private marker (0600 in a 0700 folder) with no address or secret in it", async () => {
    await runSmtpDeliveryTest(deps());
    const raw = readFileSync(markerPath(), "utf8");
    expect(JSON.parse(raw)).toEqual({ runId: "stage-a-1", status: "sent", at: "2026-11-02T12:00:00.000Z" });
    expect(raw).not.toMatch(/@|gmail|fake-app/);
    expect(statSync(markerPath()).mode & 0o777).toBe(0o600);
    expect(statSync(path.dirname(markerPath())).mode & 0o777).toBe(0o700);
  });

  describe("duplicate-send prevention", () => {
    it("a second build with the same run id sends nothing", async () => {
      await runSmtpDeliveryTest(deps());
      const again = await runSmtpDeliveryTest(deps());
      expect(again).toEqual({ status: "already-attempted", runId: "stage-a-1", previous: { result: "sent" } });
      expect(exitCodeFor(again)).toBe(0); // normal deploys continue
      expect(sent).toHaveLength(1);
    });
    it("the marker is claimed (status attempting) before the send starts", async () => {
      let seen: unknown;
      await runSmtpDeliveryTest(deps({ send: async () => { seen = JSON.parse(readFileSync(markerPath(), "utf8")); } }));
      expect(seen).toMatchObject({ runId: "stage-a-1", status: "attempting" });
    });
    it("an interrupted run (attempting, no result) blocks a resend and says so", async () => {
      mkdirSync(path.dirname(markerPath()), { recursive: true });
      writeFileSync(markerPath(), JSON.stringify({ runId: "stage-a-1", status: "attempting" }));
      const out = await runSmtpDeliveryTest(deps());
      expect(out).toEqual({ status: "already-attempted", runId: "stage-a-1", previous: { result: "attempting" } });
      expect(describeOutcome(out)).toMatch(/NEW run id/);
      expect(sent).toHaveLength(0);
    });
    it("an unreadable or foreign marker still blocks a resend", async () => {
      mkdirSync(path.dirname(markerPath()), { recursive: true });
      for (const content of ["", "not json", JSON.stringify({ status: "claimed" }), JSON.stringify({ status: "failed", errorCode: "x@gmail.com" })]) {
        writeFileSync(markerPath(), content);
        const out = await runSmtpDeliveryTest(deps());
        expect(out.status).toBe("already-attempted");
        expect(describeOutcome(out)).not.toContain("@");
      }
      expect(sent).toHaveLength(0);
    });
    it("a failed attempt is never retried with the same run id, even after the cause is fixed", async () => {
      const failing = deps({ send: async () => { throw Object.assign(new Error("535 bad credentials for x@gmail.com"), { code: "EAUTH", responseCode: 535 }); } });
      expect((await runSmtpDeliveryTest(failing)).status).toBe("failed");
      const again = await runSmtpDeliveryTest(deps());
      expect(again).toEqual({ status: "already-attempted", runId: "stage-a-1", previous: { result: "failed", errorCode: "EAUTH:535" } });
      expect(exitCodeFor(again)).toBe(0);
      expect(describeOutcome(again)).toMatch(/FAILED \(EAUTH:535\).*NEW run id/);
      expect(sent).toHaveLength(0);
    });
    it("an attempt that throws unexpectedly after the claim still spends the run id", async () => {
      expect((await runSmtpDeliveryTest(deps({ send: () => { throw new TypeError("boom"); } }))).status).toBe("failed");
      expect((await runSmtpDeliveryTest(deps())).status).toBe("already-attempted");
      expect(sent).toHaveLength(0);
    });
    it("a refusal is correctable: after fixing the cause the SAME run id sends once", async () => {
      const refused = await runSmtpDeliveryTest(deps({ env: approvedEnv({ SMTP_FROM: "wrong@gmail.com" }) }));
      expect(refused.status).toBe("refused");
      expect(describeOutcome(refused)).toMatch(/before any attempt.*same run id may be used/);
      expect(() => readdirSync(path.join(home, "nltag-data"))).toThrow();
      expect((await runSmtpDeliveryTest(deps())).status).toBe("sent");
      expect(sent).toHaveLength(1);
    });
    it("a refusal for a non-SMTP transport is also correctable with the same run id", async () => {
      expect((await runSmtpDeliveryTest(deps({ transportName: "dev-outbox" }))).status).toBe("refused");
      expect((await runSmtpDeliveryTest(deps())).status).toBe("sent");
    });
    it("concurrent builds with the same run id send at most once", async () => {
      const results = await Promise.all([runSmtpDeliveryTest(deps()), runSmtpDeliveryTest(deps()), runSmtpDeliveryTest(deps())]);
      expect(results.filter((r) => r.status === "sent")).toHaveLength(1);
      expect(sent).toHaveLength(1);
    });
    it("a new run id is a new approval and may send once more", async () => {
      await runSmtpDeliveryTest(deps());
      const second = await runSmtpDeliveryTest(deps({ env: approvedEnv({ NLTAG_SMTP_TEST_RUN_ID: "stage-a-2" }) }));
      expect(second.status).toBe("sent");
      expect(sent).toHaveLength(2);
    });
  });

  describe("error handling", () => {
    it("reports a send failure with a short code only, never the server message or addresses", async () => {
      const out = await runSmtpDeliveryTest(
        deps({ send: async () => { throw Object.assign(new Error(`535 5.7.8 Username and Password not accepted ${FAKE_PASS} newlifetamilassembly@gmail.com`), { code: "EAUTH", responseCode: 535 }); } }),
      );
      expect(out).toEqual({ status: "failed", runId: "stage-a-1", recipient: "church mailbox (+webtest)", errorCode: "EAUTH:535" });
      expect(exitCodeFor(out)).toBe(1);
      const text = describeOutcome(out) + readFileSync(markerPath(), "utf8");
      expect(text).not.toMatch(/@|Password|fake-app/);
      expect(JSON.parse(readFileSync(markerPath(), "utf8")).status).toBe("failed");
    });
    it("uses a generic code for unexpected errors", async () => {
      const out = await runSmtpDeliveryTest(deps({ send: async () => { throw "boom"; } }));
      expect(out).toMatchObject({ status: "failed", errorCode: "SEND_ERROR" });
    });
    it("refuses (sends nothing) when the transport is not SMTP", async () => {
      for (const name of ["dev-outbox", "memory"]) {
        const out = await runSmtpDeliveryTest(deps({ transportName: name }));
        expect(out.status).toBe("refused");
        expect(exitCodeFor(out)).toBe(1);
      }
      expect(sent).toHaveLength(0);
      expect(() => readdirSync(path.dirname(markerPath()))).toThrow();
    });
    it("refuses when the marker cannot be written, so a resend can never go unrecorded", async () => {
      if (process.getuid?.() === 0) return; // root ignores permissions
      chmodSync(home, 0o500);
      try {
        const out = await runSmtpDeliveryTest(deps());
        expect(out.status).toBe("refused");
        expect(sent).toHaveLength(0);
      } finally {
        chmodSync(home, 0o700);
      }
    });
    it("refuses a marker folder inside the deployed app or a web root", async () => {
      expect((await runSmtpDeliveryTest(deps({ appDir: home }))).status).toBe("refused");
      expect((await runSmtpDeliveryTest(deps({ home: path.join(root, "public_html") }))).status).toBe("refused");
      expect((await runSmtpDeliveryTest(deps({ home: "relative/home" }))).status).toBe("refused");
      expect(sent).toHaveLength(0);
    });
    it("does nothing at all when not requested", async () => {
      const out = await runSmtpDeliveryTest(deps({ env: approvedEnv({ NLTAG_APPROVED_SMTP_TEST: undefined }), transportName: "memory" }));
      expect(out).toEqual({ status: "not-requested" });
      expect(exitCodeFor(out)).toBe(0);
      expect(sent).toHaveLength(0);
    });
    it("refused configuration stops before touching the disk", async () => {
      const out = await runSmtpDeliveryTest(deps({ env: approvedEnv({ NLTAG_SMTP_TEST_TO: "someone@gmail.com" }) }));
      expect(out.status).toBe("refused");
      expect(() => readdirSync(path.join(home, "nltag-data"))).toThrow();
    });
  });

  it("describes the recipient without the address", () => {
    expect(describeRecipient(CHURCH_MAILBOX)).toBe("church mailbox");
    expect(describeRecipient("newlifetamilassembly+webtest@gmail.com")).toBe("church mailbox (+webtest)");
  });
});
