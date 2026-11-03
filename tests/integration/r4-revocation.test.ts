import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { getCurrentUser } from "@/server/auth/session";
import { issueRecognisedBrowserToken, recognisedBrowserId } from "@/server/auth/recognised-browser";
import { closeDb, getDb } from "@/server/db/client";
import { twoFactor, user } from "@/server/db/schema";
import { memoryOutbox } from "@/server/email/transport";
import { hashEmail } from "@/server/security/hash";
import { call, clearRateLimits, cookiesFrom, enrollTwoFactor, headersWith, verifiedUser } from "./helpers";
import { freshStep, totp } from "../support/totp";

/**
 * R6 / D5: recognised browsers are revoked by raising NLTAG_RECOGNISED_BROWSER_KEY_VERSION.
 * BETTER_AUTH_SECRET never changes, so authenticator secrets, recovery codes and sessions survive.
 * Replaces the b48261d test "rotating BETTER_AUTH_SECRET revokes every recognised browser".
 */

const PASSWORD = "correct-horse-battery";
const WRONG = "definitely-wrong-password";
const RB = "nltag_rb";
const attempt = (email: string, opts: { password?: string; cookie?: string } = {}) => call("/sign-in/email", { body: { email, password: opts.password ?? WRONG }, cookie: opts.cookie });
const onlyRb = (res: Response) => res.headers.getSetCookie().find((c) => c.startsWith(`${RB}=`))!.split(";")[0]!;

const saved = process.env.NLTAG_RECOGNISED_BROWSER_KEY_VERSION;
beforeEach(async () => {
  await clearRateLimits();
  memoryOutbox.length = 0;
  delete process.env.NLTAG_RECOGNISED_BROWSER_KEY_VERSION;
});
afterEach(() => {
  if (saved === undefined) delete process.env.NLTAG_RECOGNISED_BROWSER_KEY_VERSION;
  else process.env.NLTAG_RECOGNISED_BROWSER_KEY_VERSION = saved;
});
afterAll(closeDb);

describe("R4 change 6: recognised-browser revocation by key version", () => {
  it("unit: a token verifies only under the version it was issued with; a bad value accepts nothing and never throws", () => {
    const h = hashEmail("unit.rb@nltag.test");
    const t1 = issueRecognisedBrowserToken(h);
    expect(recognisedBrowserId(t1, h)).not.toBeNull();
    process.env.NLTAG_RECOGNISED_BROWSER_KEY_VERSION = "2";
    expect(recognisedBrowserId(t1, h)).toBeNull();
    const t2 = issueRecognisedBrowserToken(h);
    expect(recognisedBrowserId(t2, h)).not.toBeNull();
    process.env.NLTAG_RECOGNISED_BROWSER_KEY_VERSION = "two";
    expect(() => recognisedBrowserId(t2, h)).not.toThrow();
    expect(recognisedBrowserId(t2, h)).toBeNull();
    expect(recognisedBrowserId(issueRecognisedBrowserToken(h), h)).toBeNull();
    process.env.NLTAG_RECOGNISED_BROWSER_KEY_VERSION = "1";
    expect(recognisedBrowserId(t1, h)).not.toBeNull(); // why the runbook says: only ever raise it
  });

  it("raising the version revokes every recognised browser through the route; a delayed address then refuses the old cookie", async () => {
    const a = "rb.v.a@nltag.test";
    const b = "rb.v.b@nltag.test";
    await verifiedUser(a, PASSWORD);
    await verifiedUser(b, PASSWORD);
    const cookies: Record<string, string> = { [a]: onlyRb(await attempt(a, { password: PASSWORD })), [b]: onlyRb(await attempt(b, { password: PASSWORD })) };
    await clearRateLimits();
    for (const email of [a, b]) {
      await Promise.all(Array.from({ length: 30 }, () => attempt(email)));
      // Before revocation the cookie has its own budget: the owner still gets in.
      expect((await attempt(email, { password: PASSWORD, cookie: cookies[email] })).status).toBe(200);
    }
    process.env.NLTAG_RECOGNISED_BROWSER_KEY_VERSION = "2";
    for (const email of [a, b]) expect((await attempt(email, { password: PASSWORD, cookie: cookies[email] })).status).toBe(429);
  });

  it("authenticator, recovery codes and existing sessions are untouched by a version change", async () => {
    const email = "rb.v.totp@nltag.test";
    const session = await verifiedUser(email, PASSWORD);
    const { cookie, secret, backupCodes } = await enrollTwoFactor(session, PASSWORD);
    const [u] = await getDb().select().from(user).where(eq(user.email, email));
    const [before] = await getDb().select().from(twoFactor).where(eq(twoFactor.userId, u!.id));

    process.env.NLTAG_RECOGNISED_BROWSER_KEY_VERSION = "7";
    expect(await getCurrentUser(headersWith(cookie))).not.toBeNull();
    const [after] = await getDb().select().from(twoFactor).where(eq(twoFactor.userId, u!.id));
    expect(after).toEqual(before);

    // Full sign-in with password + current authenticator code works, and makes the browser recognised again.
    const first = await attempt(email, { password: PASSWORD });
    expect(first.status).toBe(200);
    await freshStep();
    const verified = await call("/two-factor/verify-totp", { body: { code: totp(secret) }, cookie: cookiesFrom(first) });
    expect(verified.status).toBe(200);
    const fresh = onlyRb(verified);
    expect(recognisedBrowserId(fresh.split("=")[1], hashEmail(email))).not.toBeNull();

    // A recovery code still works as the second factor.
    const second = await attempt(email, { password: PASSWORD });
    const viaCode = await call("/two-factor/verify-backup-code", { body: { code: backupCodes[0] }, cookie: cookiesFrom(second) });
    expect(viaCode.status).toBe(200);
  });
});
