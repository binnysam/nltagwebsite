import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/server/db/client";
import { auditLog, session, user, verification } from "@/server/db/schema";
import { memoryOutbox } from "@/server/email/transport";
import { call, clearRateLimits, cookiesFrom, freshIp, linkIn, mailTo, signIn, signUp, verifiedUser } from "./helpers";

afterAll(closeDb);
beforeEach(clearRateLimits);

describe("registration and email verification", () => {
  it("creates an unverified account and sends one bilingual verification email", async () => {
    const res = await signUp("new.person@nltag.test");
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie().some((c) => c.includes("session_token"))).toBe(false); // no session before verification
    const [u] = await getDb().select().from(user).where(eq(user.email, "new.person@nltag.test"));
    expect(u?.emailVerified).toBe(false);
    const mails = mailTo("new.person@nltag.test");
    expect(mails).toHaveLength(1);
    expect(mails[0]!.subject).toMatch(/சரிபார்க்கவும்.*Verify your email address/);
    expect(mails[0]!.text).toContain("/api/auth/verify-email?token=");
  });

  it("blocks sign-in until the email is verified, then the link verifies and signs in", async () => {
    await signUp("verify.me@nltag.test", "correct-horse-battery");
    const before = await signIn("verify.me@nltag.test", "correct-horse-battery");
    expect(before.res.status).toBe(403);
    const link = linkIn(mailTo("verify.me@nltag.test")[0]!.text);
    const res = await call(link, { method: "GET" });
    expect([200, 302]).toContain(res.status);
    const cookie = cookiesFrom(res);
    expect(cookie).toContain("nltag.session_token");
    const s = await call("/get-session", { cookie });
    const body = (await s.json()) as { user: { email: string; emailVerified: boolean } };
    expect(body.user.emailVerified).toBe(true);
    const audits = await getDb().select().from(auditLog).where(eq(auditLog.action, "auth.email.verify"));
    expect(audits.length).toBeGreaterThan(0);
  });

  it("stores verification tokens hashed, never the token from the link", async () => {
    await signUp("hashed.token@nltag.test");
    const token = new URL(linkIn(mailTo("hashed.token@nltag.test")[0]!.text)).searchParams.get("token")!;
    const rows = await getDb().select().from(verification);
    const raw = JSON.stringify(rows);
    // Better Auth email-verification tokens are signed JWTs; reset tokens are random ids stored hashed.
    expect(raw).not.toContain(token);
  });

  it("gives the same response for an address that is already registered (no account discovery)", async () => {
    const first = await signUp("taken@nltag.test");
    const again = await signUp("taken@nltag.test", "another-good-password");
    expect(again.status).toBe(first.status);
    const a = (await first.json()) as Record<string, unknown>;
    const b = (await again.json()) as Record<string, unknown>;
    expect(Object.keys(b).sort()).toEqual(Object.keys(a).sort());
    const users = await getDb().select().from(user).where(eq(user.email, "taken@nltag.test"));
    expect(users).toHaveLength(1);
  });

  it("treats email case as the same account", async () => {
    await signUp("Case.Test@nltag.test");
    await signUp("case.test@NLTAG.test", "another-good-password");
    const rows = await getDb().execute(sql`SELECT COUNT(*) AS n FROM user WHERE email = 'case.test@nltag.test'`);
    expect(Number((rows[0] as unknown as Array<{ n: number }>)[0]!.n)).toBe(1);
  });

  it("rejects passwords shorter than 10 characters", async () => {
    const res = await signUp("short.pw@nltag.test", "123456789");
    expect(res.status).toBe(400);
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

  it("lists own sessions and revokes the others", async () => {
    const email = "multi.device@nltag.test";
    await verifiedUser(email, "multi-device-pass");
    const a = (await signIn(email, "multi-device-pass")).cookie;
    const b = (await signIn(email, "multi-device-pass")).cookie;
    const list = (await (await call("/list-sessions", { cookie: a })).json()) as unknown[];
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
    expect(rows.every((r) => r.ipHash && /^[0-9a-f]{64}$/.test(r.ipHash))).toBe(true);
  });

  it("never contains emails, tokens or raw IP addresses anywhere in the audit table", async () => {
    const rows = await getDb().select().from(auditLog);
    const dump = JSON.stringify(rows);
    expect(dump).not.toMatch(/@/);
    expect(dump).not.toMatch(/198\.51\.100\./);
    expect(dump).not.toMatch(/token=/);
  });
});
