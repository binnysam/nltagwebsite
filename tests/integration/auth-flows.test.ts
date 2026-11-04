import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getAuth } from "@/server/auth/auth";
import { closeDb, getDb } from "@/server/db/client";
import { account, auditLog, session, user, verification } from "@/server/db/schema";
import { memoryOutbox } from "@/server/email/transport";
import { call, clearRateLimits, cookiesFrom, freshIp, headersWith, linkIn, mailTo, newestLinkToken, requestAccount, restoreEnv, signIn, verifiedUser } from "./helpers";

afterAll(closeDb);
beforeEach(clearRateLimits);

// R4 class C (D1 mailbox-first): registration is an account request through /api/account-request;
// the emailed set-password link proves the mailbox and sets the first password. Same security
// properties as the b48261d password sign-up tests, on the surviving mechanism.
describe("registration (mailbox-first) and email verification", () => {
  it("an account request creates an unverified account with no password and sends one bilingual set-password email", async () => {
    const res = await requestAccount("new.person@nltag.test");
    expect(res.status).toBe(202);
    expect(res.headers.getSetCookie().some((c) => c.includes("session_token"))).toBe(false); // no session from a request
    const [u] = await getDb().select().from(user).where(eq(user.email, "new.person@nltag.test"));
    expect(u?.emailVerified).toBe(false);
    expect(await getDb().select().from(account).where(eq(account.userId, u!.id))).toHaveLength(0); // no credential
    const mails = mailTo("new.person@nltag.test");
    expect(mails).toHaveLength(1);
    expect(mails[0]!.subject).toMatch(/அமைக்கவும்.*Set your password/);
    expect(mails[0]!.text).toMatch(/\/api\/auth\/reset-password\/[A-Za-z0-9]{24}\?callbackURL=%2Fen%2Fset-password/);
    expect(mails[0]!.html).toContain('lang="ta"');
    expect(mails[0]!.html).toContain('lang="en"');
  });

  it("blocks sign-in until the link is used; the link sets the password and verifies but does not sign in; sign-in then works", async () => {
    const email = "verify.me@nltag.test";
    await requestAccount(email);
    const before = await signIn(email, "correct-horse-battery");
    expect(before.res.status).toBe(401); // no password exists yet (same answer as a wrong password)
    const link = linkIn(mailTo(email)[0]!.text);
    const opened = await call(link, { method: "GET" });
    expect(opened.status).toBe(302);
    expect(cookiesFrom(opened)).not.toMatch(/session_token=[^;]+/); // opening the link never signs in
    const token = new URL(opened.headers.get("location")!, "http://localhost:3000").searchParams.get("token")!;
    const set = await call("/reset-password", { body: { token, newPassword: "correct-horse-battery" } });
    expect(set.status).toBe(200);
    expect(cookiesFrom(set)).not.toMatch(/session_token=[^;]+/); // setting the password never signs in
    const [u] = await getDb().select().from(user).where(eq(user.email, email));
    expect(u?.emailVerified).toBe(true);
    const after = await signIn(email, "correct-horse-battery");
    expect(after.res.status).toBe(200);
    const s = await call("/get-session", { cookie: after.cookie });
    const body = (await s.json()) as { user: { email: string; emailVerified: boolean } };
    expect(body.user.emailVerified).toBe(true);
    const audits = await getDb().select().from(auditLog).where(eq(auditLog.action, "auth.password.reset"));
    expect(audits.some((a) => a.entityId === u!.id)).toBe(true);
  });

  it("stores set-password tokens hashed (sha256 identifier only), never the token from the link", async () => {
    await requestAccount("hashed.token@nltag.test");
    const token = new URL(linkIn(mailTo("hashed.token@nltag.test")[0]!.text)).pathname.split("/").at(-1)!;
    const rows = await getDb().select().from(verification);
    const raw = JSON.stringify(rows);
    expect(raw).not.toContain(token);
    const expected = createHash("sha256").update(`reset-password:${token}`).digest("base64url");
    expect(rows.filter((r) => r.identifier === expected)).toHaveLength(1);
  });

  it("gives the same response for a new, an already-registered and an unlisted address (no account discovery)", async () => {
    const saved = process.env.NLTAG_SIGNUP_ALLOWLIST;
    process.env.NLTAG_SIGNUP_ALLOWLIST = "taken@nltag.test,fresh.one@nltag.test";
    try {
      await requestAccount("taken@nltag.test");
      const observe = async (res: Response) => ({ status: res.status, body: await res.text(), headers: [...res.headers].filter(([k]) => k !== "date").sort() });
      const again = await observe(await requestAccount("taken@nltag.test"));
      const fresh = await observe(await requestAccount("fresh.one@nltag.test"));
      const unlisted = await observe(await requestAccount("unlisted.one@nltag.test"));
      expect(again.status).toBe(202);
      expect(fresh).toEqual(again);
      expect(unlisted).toEqual(again);
      expect(await getDb().select().from(user).where(eq(user.email, "taken@nltag.test"))).toHaveLength(1);
      expect(await getDb().select().from(user).where(eq(user.email, "unlisted.one@nltag.test"))).toHaveLength(0);
    } finally {
      restoreEnv("NLTAG_SIGNUP_ALLOWLIST", saved);
    }
  });

  it("treats email case as the same account", async () => {
    await requestAccount("Case.Test@nltag.test");
    await requestAccount("case.test@NLTAG.test");
    const rows = await getDb().execute(sql`SELECT COUNT(*) AS n FROM user WHERE email = 'case.test@nltag.test'`);
    expect(Number((rows[0] as unknown as Array<{ n: number }>)[0]!.n)).toBe(1);
  });

  it("rejects passwords shorter than 10 characters, and the link still works afterwards", async () => {
    await requestAccount("short.pw@nltag.test");
    const token = newestLinkToken("short.pw@nltag.test");
    const res = await call("/reset-password", { body: { token, newPassword: "123456789" } });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code?: string }).code).toBe("PASSWORD_TOO_SHORT");
    const ok = await call("/reset-password", { body: { token, newPassword: "1234567890" } });
    expect(ok.status).toBe(200);
  });
});

describe("password reset", () => {
  it("answers identically for unknown and known addresses, and only emails the known one", async () => {
    await verifiedUser("reset.known@nltag.test");
    const known = await call("/request-password-reset", { body: { email: "reset.known@nltag.test", redirectTo: "/en/reset-password" }, ip: freshIp() });
    const unknown = await call("/request-password-reset", { body: { email: "nobody.here@nltag.test", redirectTo: "/en/reset-password" }, ip: freshIp() });
    expect(unknown.status).toBe(known.status);
    expect(await unknown.text()).toBe(await known.text());
    expect(mailTo("nobody.here@nltag.test")).toHaveLength(0);
    expect(mailTo("reset.known@nltag.test").filter((m) => m.subject.includes("Reset"))).toHaveLength(1);
  });

  it("resets the password once, revokes old sessions and rejects the old password", async () => {
    const email = "reset.flow@nltag.test";
    const oldCookie = await verifiedUser(email, "first-password-123");
    await call("/request-password-reset", { body: { email, redirectTo: "/en/reset-password" }, ip: freshIp() });
    const mail = mailTo(email).find((m) => m.subject.includes("Reset"))!;
    // The emailed link goes through Better Auth, which redirects to our page with ?token=…
    const redirect = await call(linkIn(mail.text), { method: "GET" });
    const location = redirect.headers.get("location")!;
    const token = new URL(location, "http://localhost:3000").searchParams.get("token")!;
    expect(token).toBeTruthy();
    const ok = await call("/reset-password", { body: { token, newPassword: "second-password-456" }, ip: freshIp() });
    expect(ok.status).toBe(200);
    const reuse = await call("/reset-password", { body: { token, newPassword: "third-password-789" }, ip: freshIp() });
    expect(reuse.status).toBe(400);
    const oldSession = await call("/get-session", { cookie: oldCookie });
    expect(await oldSession.json()).toBeNull();
    expect((await signIn(email, "first-password-123")).res.status).toBe(401);
    expect((await signIn(email, "second-password-456")).res.status).toBe(200);
    const audits = await getDb().select().from(auditLog).where(eq(auditLog.action, "auth.password.reset"));
    expect(audits.length).toBeGreaterThan(0);
  });
});

describe("sessions", () => {
  it("sets HttpOnly, SameSite=Lax session cookies with the nltag prefix", async () => {
    await verifiedUser("cookie.check@nltag.test", "cookie-password-1");
    const { res } = await signIn("cookie.check@nltag.test", "cookie-password-1");
    const sessionCookie = res.headers.getSetCookie().find((c) => c.startsWith("nltag.session_token="))!;
    expect(sessionCookie).toMatch(/HttpOnly/i);
    expect(sessionCookie).toMatch(/SameSite=Lax/i);
    expect(sessionCookie).toMatch(/Max-Age=604800/); // 7 days for members
  });

  it("sign-out deletes the session server-side", async () => {
    await verifiedUser("signout@nltag.test", "signout-password-1");
    const { cookie } = await signIn("signout@nltag.test", "signout-password-1");
    const before = await getDb().select().from(session);
    const out = await call("/sign-out", { body: {}, cookie });
    expect(out.status).toBe(200);
    const after = await getDb().select().from(session);
    expect(after.length).toBe(before.length - 1);
    expect(await (await call("/get-session", { cookie })).json()).toBeNull();
  });

  // R4 class D (D4/D6): sessions are listed server-side by the account page (getAuth().api);
  // /list-sessions is the gate's 404. Revoking the others stays a routed endpoint.
  it("lists own sessions (server-side) and revokes the others; /list-sessions is closed over HTTP", async () => {
    const email = "multi.device@nltag.test";
    await verifiedUser(email, "multi-device-pass");
    const a = (await signIn(email, "multi-device-pass")).cookie;
    const b = (await signIn(email, "multi-device-pass")).cookie;
    expect((await call("/list-sessions", { method: "GET", cookie: a })).status).toBe(404);
    const list = (await getAuth().api.listSessions({ headers: headersWith(a) })) as unknown[];
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect((await call("/revoke-other-sessions", { body: {}, cookie: a })).status).toBe(200);
    expect(await (await call("/get-session", { cookie: b })).json()).toBeNull();
    expect(await (await call("/get-session", { cookie: a })).json()).not.toBeNull();
  });
});

describe("abuse protection", () => {
  it("rate-limits sign-in to 5 attempts per 15 minutes per client", async () => {
    const ip = freshIp();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await call("/sign-in/email", { body: { email: "brute@nltag.test", password: "wrong-password-x" }, ip })).status);
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(statuses[5]).toBe(429);
  });

  it("sends at most 3 account emails per address per hour, whatever the client", async () => {
    const email = "flood.target@nltag.test";
    await verifiedUser(email);
    memoryOutbox.length = 0;
    for (let i = 0; i < 5; i++) await call("/request-password-reset", { body: { email, redirectTo: "/en/reset-password" }, ip: freshIp() });
    expect(mailTo(email)).toHaveLength(3);
    const suppressed = await getDb().select().from(auditLog).where(eq(auditLog.action, "email.suppress"));
    expect(suppressed.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects cookie-carrying requests from another origin (CSRF)", async () => {
    await verifiedUser("csrf.check@nltag.test", "csrf-password-12");
    const { cookie } = await signIn("csrf.check@nltag.test", "csrf-password-12");
    const forged = await call("/revoke-other-sessions", { body: {}, cookie, origin: "https://evil.example" });
    expect(forged.status).toBe(403);
    const noOrigin = await call("/sign-out", { body: {}, cookie, origin: null });
    expect(noOrigin.status).toBe(403);
    expect(await (await call("/get-session", { cookie })).json()).not.toBeNull();
  });

  it("rejects cross-site sign-in (login CSRF) and foreign redirect targets", async () => {
    await verifiedUser("login.csrf@nltag.test", "login-csrf-pass-1");
    const crossSite = await call("/sign-in/email", {
      body: { email: "login.csrf@nltag.test", password: "login-csrf-pass-1" },
      origin: "https://evil.example",
      headers: { "sec-fetch-site": "cross-site", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" },
      ip: freshIp(),
    });
    expect(crossSite.status).toBe(403);
    const openRedirect = await call("/request-password-reset", { body: { email: "login.csrf@nltag.test", redirectTo: "https://evil.example/steal" }, ip: freshIp() });
    expect(openRedirect.status).toBe(403);
  });

  it("does not offer Google sign-in when it is not configured", async () => {
    const res = await call("/sign-in/social", { body: { provider: "google", callbackURL: "/en" }, ip: freshIp() });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe("audit log privacy", () => {
  it("records failed sign-ins without the email address", async () => {
    await call("/sign-in/email", { body: { email: "who.am.i@nltag.test", password: "nope-nope-nope" }, ip: freshIp() });
    const rows = await getDb().select().from(auditLog).where(eq(auditLog.action, "auth.sign_in.fail"));
    expect(rows.length).toBeGreaterThan(0);
    // Keyed hash of the resolved address, or no IP at all when it cannot be trusted
    // (client-ip-rate-limit.test.ts) — never a raw address.
    expect(rows.every((r) => r.ipHash === null || /^[0-9a-f]{64}$/.test(r.ipHash))).toBe(true);
    expect(rows.some((r) => r.ipHash !== null)).toBe(true);
  });

  it("never contains emails, tokens or raw IP addresses anywhere in the audit table", async () => {
    const rows = await getDb().select().from(auditLog);
    const dump = JSON.stringify(rows);
    expect(dump).not.toMatch(/@/);
    expect(dump).not.toMatch(/198\.51\.100\./);
    expect(dump).not.toMatch(/token=/);
  });
});
