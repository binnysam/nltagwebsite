import { randomUUID } from "node:crypto";
import { hashPassword, symmetricEncrypt } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getAuth } from "@/server/auth/auth";
import { closeDb, getDb } from "@/server/db/client";
import { account, auditLog, twoFactor, user } from "@/server/db/schema";
import { resetGateLimitersForTests } from "@/server/security/auth-abuse-gate";
import { base32Decode, freshStep, totp } from "../support/totp";
import { call, clearRateLimits, cookiesFrom, headersWith } from "../integration/helpers";

/**
 * L6 (post-deployment review, 4 Nov 2026): v6.1 G1 under the PRODUCTION cookie names.
 * With NODE_ENV=production Better Auth uses secure cookies, so every name gets the `__Secure-`
 * prefix (`__Secure-nltag.two_factor`, `__Secure-nltag.session_token`). The gate reads the names
 * from Better Auth's own context; this checks that by running G1 end to end with the real
 * production names, so a mismatch (which would 404 every authenticator code at activation) fails
 * here instead of at runbook §6.6. Fictional @nltag.test accounts; the fixture is inserted directly
 * because the seed refuses NODE_ENV=production.
 */

const PASSWORD = "correct-horse-battery-prod";
const TOTP_SECRET = "nltag-test-only-l6-totp-secret-0"; // fictional, test-only
const saved = { ...process.env };
const PROD_ENV = {
  NLTAG_ACCOUNTS_ENABLED: "1",
  SMTP_HOST: "smtp.example.test",
  SMTP_USER: "u",
  SMTP_PASS: "p",
  SMTP_FROM: "NLTAG <u@example.test>",
  NLTAG_SIGNUP_ALLOWLIST: "listed.prod@nltag.test",
};

/** A verified account with a password and, optionally, an authenticator already confirmed. */
async function account2fa(email: string, withTwoFactor: boolean): Promise<string> {
  const db = getDb();
  const id = randomUUID();
  const now = new Date();
  const key = (await getAuth().$context).secretConfig;
  await db.insert(user).values({ id, name: "Test L6", email, emailVerified: true, twoFactorEnabled: withTwoFactor, createdAt: now, updatedAt: now });
  await db.insert(account).values({ id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: await hashPassword(PASSWORD), createdAt: now, updatedAt: now });
  if (withTwoFactor) {
    await db.insert(twoFactor).values({
      id: randomUUID(),
      userId: id,
      secret: await symmetricEncrypt({ key, data: TOTP_SECRET }),
      backupCodes: await symmetricEncrypt({ key, data: JSON.stringify(["L6RC-00000"]) }),
      verified: true,
    });
  }
  return id;
}

const passwordStep = (email: string) => call("/sign-in/email", { body: { email, password: PASSWORD } });
const setCookieNames = (res: Response) => res.headers.getSetCookie().map((l) => l.split("=")[0]!.trim());

beforeAll(() => Object.assign(process.env, PROD_ENV));
afterAll(async () => {
  for (const k of Object.keys(PROD_ENV)) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  await closeDb();
});
beforeEach(async () => {
  await clearRateLimits();
  resetGateLimitersForTests();
});

describe("L6: G1 with production cookie names (NODE_ENV=production)", () => {
  it("runs in production mode, and Better Auth's names carry the __Secure- prefix", async () => {
    expect(process.env.NODE_ENV).toBe("production");
    const ctx = await getAuth().$context;
    expect(ctx.createAuthCookie("two_factor").name).toBe("__Secure-nltag.two_factor");
    expect(ctx.authCookies.sessionToken.name).toBe("__Secure-nltag.session_token");
    expect(ctx.authCookies.sessionData.name).toBe("__Secure-nltag.session_data");
  });

  it("the password step sets the __Secure- challenge cookie (Secure, HttpOnly) and no session", async () => {
    const email = "l6.challenge@nltag.test";
    await account2fa(email, true);
    const res = await passwordStep(email);
    expect(res.status).toBe(200);
    expect(((await res.clone().json()) as { twoFactorRedirect?: boolean }).twoFactorRedirect).toBe(true);
    const lines = res.headers.getSetCookie();
    const challenge = lines.find((l) => l.startsWith("__Secure-nltag.two_factor="));
    expect(challenge).toBeDefined();
    expect(challenge).toMatch(/;\s*Secure/i);
    expect(challenge).toMatch(/;\s*HttpOnly/i);
    // No usable session yet: the plugin only clears the session cookie at this step.
    for (const l of lines.filter((x) => x.startsWith("__Secure-nltag.session_token="))) expect(l).toMatch(/^__Secure-nltag\.session_token=;|Max-Age=0/i);
    expect(setCookieNames(res).some((n) => n === "nltag.two_factor")).toBe(false);
  });

  it("with the real __Secure- challenge cookie a correct code completes sign-in, even next to an old session cookie", async () => {
    const email = "l6.complete@nltag.test";
    const id = await account2fa(email, true);
    const step1 = await passwordStep(email);
    const cookie = cookiesFrom(step1);
    expect(cookie).toContain("__Secure-nltag.two_factor=");
    await freshStep();
    const res = await call("/two-factor/verify-totp", {
      body: { code: totp(TOTP_SECRET) },
      cookie: `__Secure-nltag.session_token=stale-session-value; ${cookie}`,
    });
    expect(res.status).toBe(200);
    expect(setCookieNames(res)).toContain("__Secure-nltag.session_token");
    const sessions = await getDb().select().from(auditLog).where(and(eq(auditLog.action, "auth.session.create"), eq(auditLog.actorUserId, id)));
    expect(sessions.length).toBeGreaterThan(0);
  });

  it("without the challenge cookie (session only): the gate's 404 on both verify routes", async () => {
    const email = "l6.nochallenge@nltag.test";
    await account2fa(email, false);
    const session = cookiesFrom(await passwordStep(email));
    expect(session).toContain("__Secure-nltag.session_token=");
    for (const path of ["/two-factor/verify-totp", "/two-factor/verify-backup-code"]) {
      const res = await call(path, { body: { code: path.endsWith("totp") ? "123456" : "AAAAA-AAAAA" }, cookie: session });
      expect(res.status, path).toBe(404);
      expect(await res.text()).toBe("Not Found");
    }
  });

  it("the development cookie name is not a challenge in production: `nltag.two_factor` gets the gate's 404", async () => {
    const email = "l6.devname@nltag.test";
    await account2fa(email, true);
    const step1 = await passwordStep(email);
    const value = step1.headers.getSetCookie().find((l) => l.startsWith("__Secure-nltag.two_factor="))!.split(";")[0]!.split("=").slice(1).join("=");
    await freshStep();
    const res = await call("/two-factor/verify-totp", { body: { code: totp(TOTP_SECRET) }, cookie: `nltag.two_factor=${value}` });
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not Found");
  });

  it("a forged __Secure- challenge name next to a real __Secure- session cannot reach the enrollment lane (session stripped)", async () => {
    const email = "l6.forged@nltag.test";
    const id = await account2fa(email, false);
    const session = cookiesFrom(await passwordStep(email));
    const enabled = (await getAuth().api.enableTwoFactor({ headers: headersWith(session), body: { password: PASSWORD, method: "totp" } as never })) as { totpURI: string };
    const secret = base32Decode(new URL(enabled.totpURI).searchParams.get("secret")!);
    await freshStep();
    const res = await call("/two-factor/verify-totp", { body: { code: totp(secret) }, cookie: `${session}; __Secure-nltag.two_factor=forged` });
    expect(res.status).toBe(401);
    expect(((await res.json()) as { code?: string }).code).toBe("INVALID_TWO_FACTOR_COOKIE");
    const [u] = await getDb().select({ on: user.twoFactorEnabled }).from(user).where(eq(user.id, id));
    expect(u!.on).toBe(false);
    expect(await getDb().select().from(auditLog).where(and(eq(auditLog.action, "auth.2fa.enable"), eq(auditLog.actorUserId, id)))).toHaveLength(0);
  });
});
