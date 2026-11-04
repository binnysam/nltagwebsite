import { and, eq, gte } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/server/db/client";
import { auditLog, rateLimitBucket } from "@/server/db/schema";
import { memoryOutbox } from "@/server/email/transport";
import { hashEmail } from "@/server/security/hash";
import { releaseAttempt, reserveAttempt, signInAccountKey, THROTTLES, throttleDelaySeconds } from "@/server/services/rate-limit";
import { issueRecognisedBrowserToken } from "@/server/auth/recognised-browser";
import { resetServerEnvForTests } from "@/server/env";
import { call, clearRateLimits, cookiesFrom, enrollTwoFactor, freshIp, mailTo, verifiedUser } from "./helpers";
import { freshStep, totp, wrongCode } from "../support/totp";

/**
 * Sign-in protection (PR #11 follow-up, Nov 2026; docs/backend/data-and-auth.md → "Sign-in protection").
 *  H1  every password check is reserved atomically per account BEFORE it runs;
 *  M1  progressive delay instead of a hard lock, a recognised-browser budget, alerting;
 *  L1  no fixed-window boundary; L3 one audit row per address per hour.
 */

afterAll(closeDb);
beforeEach(async () => {
  await clearRateLimits();
  memoryOutbox.length = 0;
});
afterEach(() => vi.useRealTimers());

const RULE = THROTTLES.signInAccount;
const FREE = RULE.free;
const PASSWORD = "correct-horse-battery";
const WRONG = "definitely-wrong-password";
const RB = "nltag_rb"; // cookie name outside production

const attempt = (email: string, opts: { password?: string; ip?: string; cookie?: string } = {}) =>
  call("/sign-in/email", { body: { email, password: opts.password ?? WRONG }, ip: opts.ip ?? freshIp(), cookie: opts.cookie });
const json = async (res: Response) => (await res.clone().json()) as { code?: string; twoFactorRedirect?: boolean };
const rbCookie = (res: Response) => res.headers.getSetCookie().find((c) => c.startsWith(`${RB}=`));
/** Only the recognised-browser cookie, so a request carries no session. */
const onlyRb = (res: Response) => rbCookie(res)!.split(";")[0]!;

async function auditCount(action: string, since: Date, reason?: string) {
  const rows = await getDb().select({ reason: auditLog.reason }).from(auditLog).where(and(eq(auditLog.action, action), gte(auditLog.createdAt, since)));
  return rows.filter((r) => reason === undefined || r.reason === reason).length;
}

describe("H1: the per-account reservation cannot be raced", () => {
  it("40 simultaneous wrong passwords from 40 IPs against one account run at most the configured number of password checks", async () => {
    const email = "race.target@nltag.test";
    await verifiedUser(email, PASSWORD);
    const since = new Date();
    const ips = Array.from({ length: 40 }, (_, i) => `203.0.113.${100 + i}`);
    const results = await Promise.all(ips.map((ip) => attempt(email, { ip })));
    const statuses = results.map((r) => r.status);
    // A 401 is a password check that ran; a 429 was refused before any password work.
    expect(statuses.filter((s) => s === 401)).toHaveLength(FREE);
    expect(statuses.filter((s) => s === 429)).toHaveLength(40 - FREE);
    // Independent count: the after-hook audit row exists only when Better Auth ran the check.
    expect(await auditCount("auth.sign_in.fail", since, "UNAUTHORIZED")).toBe(FREE);
    const [row] = await getDb().select({ count: rateLimitBucket.count }).from(rateLimitBucket).where(eq(rateLimitBucket.bucketKey, signInAccountKey(hashEmail(email))));
    expect(row?.count).toBe(FREE);
  });

  it("holds for an address with no account (same numbers, no discovery)", async () => {
    const results = await Promise.all(Array.from({ length: 40 }, (_, i) => attempt("race.nobody@nltag.test", { ip: `198.51.100.${100 + i}` })));
    expect(results.filter((r) => r.status === 401)).toHaveLength(FREE);
    expect(results.filter((r) => r.status === 429)).toHaveLength(40 - FREE);
  });

  it("holds against two bursts in a row and against repeated bursts within the delay", async () => {
    const email = "race.twice@nltag.test";
    const burst = () => Promise.all(Array.from({ length: 20 }, () => attempt(email)));
    const first = await burst();
    const second = await burst();
    expect([...first, ...second].filter((r) => r.status === 401)).toHaveLength(FREE);
  });

  it("the conditional increment itself never exceeds the schedule under 60 concurrent reservations", async () => {
    const key = "test:concurrent-reserve";
    const now = Date.now();
    const results = await Promise.all(Array.from({ length: 60 }, () => reserveAttempt(key, RULE, now)));
    expect(results.filter((r) => r.allowed)).toHaveLength(FREE);
    expect(results.filter((r) => !r.allowed).every((r) => r.retryAfterSeconds === RULE.baseDelay)).toBe(true);
  });
});

describe("H1: correct passwords", () => {
  it("give their reservation back, so the account holder's own sign-ins cost nothing", async () => {
    const email = "correct.many@nltag.test";
    await verifiedUser(email, PASSWORD);
    for (let i = 0; i < FREE * 3; i++) expect((await attempt(email, { password: PASSWORD })).status).toBe(200);
    // The full free budget is still there for typing mistakes.
    expect((await Promise.all(Array.from({ length: FREE }, () => attempt(email)))).map((r) => r.status)).toEqual(Array(FREE).fill(401));
  });

  it("give back the reservation when the second factor is still to come (password right, no session yet)", async () => {
    const email = "correct.twofactor@nltag.test";
    const { secret } = await enrollTwoFactor(await verifiedUser(email, PASSWORD));
    for (let i = 0; i < FREE + 2; i++) expect((await json(await attempt(email, { password: PASSWORD }))).twoFactorRedirect).toBe(true);
    void secret;
    const [row] = await getDb().select({ count: rateLimitBucket.count }).from(rateLimitBucket).where(eq(rateLimitBucket.bucketKey, signInAccountKey(hashEmail(email))));
    expect(row?.count ?? 0).toBe(0);
  });

  it("are refused like wrong ones while the address is delayed (no password oracle)", async () => {
    const email = "correct.oracle@nltag.test";
    await verifiedUser(email, PASSWORD);
    await Promise.all(Array.from({ length: FREE }, () => attempt(email)));
    const right = await attempt(email, { password: PASSWORD });
    const wrong = await attempt(email);
    expect(right.status).toBe(429);
    expect(await right.text()).toBe(await wrong.text());
  });

  it("releaseAttempt never goes below zero", async () => {
    await releaseAttempt("test:never-reserved");
    const key = "test:release-floor";
    await reserveAttempt(key, RULE);
    await releaseAttempt(key);
    await releaseAttempt(key);
    const [row] = await getDb().select({ count: rateLimitBucket.count }).from(rateLimitBucket).where(eq(rateLimitBucket.bucketKey, key));
    expect(row?.count).toBe(0);
  });
});

describe("M1 + L1: progressive delay, never an indefinite block, no window boundary", () => {
  const key = "test:schedule";

  it("follows the documented schedule: 5 free, then 30 s, 1, 2, 4, 8 min, then every 15 min", async () => {
    // Owner-approved values (3 Nov 2026); both budgets use the same schedule. R4 D2 (3 Nov 2026):
    // the reset after a quiet period is 3 hours (was 1 hour).
    const approved = { free: 5, baseDelay: 30, maxDelay: 15 * 60, resetSeconds: 3 * 3600 };
    expect(THROTTLES.signInAccount).toEqual(approved);
    expect(THROTTLES.signInRecognisedBrowser).toEqual(approved);
    expect([0, 4, 5, 6, 7, 8, 9, 10, 11, 50].map((c) => throttleDelaySeconds(c, RULE))).toEqual([0, 0, 30, 60, 120, 240, 480, 900, 900, 900]);
    let t = Date.UTC(2026, 10, 3, 9, 0, 0);
    for (let i = 0; i < FREE; i++) expect((await reserveAttempt(key, RULE, t)).allowed).toBe(true);
    for (const wait of [30, 60, 120, 240, 480, 900, 900, 900]) {
      const early = await reserveAttempt(key, RULE, t + (wait - 1) * 1000);
      expect(early).toMatchObject({ allowed: false, retryAfterSeconds: 1 });
      t += wait * 1000;
      expect((await reserveAttempt(key, RULE, t)).allowed).toBe(true);
    }
  });

  it("refused attempts do not extend the delay (an attacker cannot keep pushing the next slot away)", async () => {
    const t = Date.UTC(2026, 10, 3, 10, 0, 0);
    for (let i = 0; i < FREE; i++) await reserveAttempt(key, RULE, t);
    for (let s = 1; s < 30; s++) expect((await reserveAttempt(key, RULE, t + s * 1000)).allowed).toBe(false);
    expect((await reserveAttempt(key, RULE, t + 30_000)).allowed).toBe(true);
  });

  it("has no boundary to exploit: the budget only refills after 3 hours without counted attempts (D2)", async () => {
    const t = Date.UTC(2026, 10, 3, 11, 14, 0); // late in any 15-minute window
    for (let i = 0; i < FREE; i++) expect((await reserveAttempt(key, RULE, t)).allowed).toBe(true);
    // A fixed window would allow a fresh burst of 5 at 11:15; here only the one delayed slot opens.
    const boundary = Date.UTC(2026, 10, 3, 11, 15, 1);
    const atBoundary = await Promise.all(Array.from({ length: FREE }, () => reserveAttempt(key, RULE, boundary)));
    expect(atBoundary.filter((r) => r.allowed)).toHaveLength(1);
    // 2 h 59 min of silence is not enough to refill the budget (D2: 3-hour reset).
    const quiet = boundary + (2 * 60 + 59) * 60_000;
    expect((await Promise.all(Array.from({ length: FREE }, () => reserveAttempt(key, RULE, quiet)))).filter((r) => r.allowed)).toHaveLength(1);
    // Three hours after the last counted attempt the episode is over: the free attempts return.
    const later = quiet + 3 * 3600_000;
    for (let i = 0; i < FREE; i++) expect((await reserveAttempt(key, RULE, later)).allowed).toBe(true);
  });

  it("at most about 100 password checks per day per address, however many IPs", async () => {
    const t0 = Date.UTC(2026, 10, 4, 0, 0, 0);
    let allowed = 0;
    // An attacker trying every 10 seconds for 24 hours.
    for (let t = t0; t < t0 + 24 * 3600_000; t += 10_000) if ((await reserveAttempt("test:day", RULE, t)).allowed) allowed++;
    expect(allowed).toBeLessThanOrEqual(110);
    expect(allowed).toBeGreaterThan(FREE); // never a permanent block
  }, 120_000);

  it("through the sign-in route: 429 carries Retry-After, and the next slot opens on time", async () => {
    const email = "delay.route@nltag.test";
    vi.useFakeTimers({ toFake: ["Date"] });
    // In the past, so the audit rows written here never sort ahead of other tests' "latest" rows.
    const start = Date.UTC(2025, 0, 6, 8, 0, 0);
    vi.setSystemTime(start);
    for (let i = 0; i < FREE; i++) expect((await attempt(email)).status).toBe(401);
    const refused = await attempt(email);
    expect(refused.status).toBe(429);
    expect(refused.headers.get("retry-after")).toBe("30");
    vi.setSystemTime(start + 30_000);
    expect((await attempt(email)).status).toBe(401);
    expect((await attempt(email)).headers.get("retry-after")).toBe("60");
  });
});

describe("M1: a recognised browser cannot be locked out by someone who knows the address", () => {
  it("is recognised only after a complete sign-in, with a narrow HttpOnly cookie", async () => {
    const email = "rb.basic@nltag.test";
    await verifiedUser(email, PASSWORD);
    const wrong = await attempt(email);
    expect(rbCookie(wrong)).toBeUndefined();
    const ok = await attempt(email, { password: PASSWORD });
    expect(ok.status).toBe(200);
    const set = rbCookie(ok)!;
    expect(set).toMatch(/HttpOnly/i);
    expect(set).toMatch(/Path=\/api\/auth/);
    expect(set).toMatch(/SameSite=Strict/i);
    expect(set).toMatch(/Max-Age=2592000/); // 30 days (owner decision, 3 Nov 2026)
    expect(set).not.toContain(email);
  });

  it("signs in with the right password while attackers keep the address delayed", async () => {
    const email = "rb.owner@nltag.test";
    await verifiedUser(email, PASSWORD);
    const mine = onlyRb(await attempt(email, { password: PASSWORD }));
    await Promise.all(Array.from({ length: 30 }, () => attempt(email)));
    expect((await attempt(email, { password: PASSWORD })).status).toBe(429); // unrecognised browser
    const res = await attempt(email, { password: PASSWORD, cookie: mine });
    expect(res.status).toBe(200);
    expect(cookiesFrom(res)).toContain("session_token");
  });

  it("still needs the authenticator code for a two-factor account, and is recognised only after it", async () => {
    const email = "rb.admin@nltag.test";
    const { secret } = await enrollTwoFactor(await verifiedUser(email, PASSWORD));
    const ip = freshIp();
    const step1 = await call("/sign-in/email", { body: { email, password: PASSWORD }, ip });
    expect((await json(step1)).twoFactorRedirect).toBe(true);
    expect(rbCookie(step1)).toBeUndefined(); // the password alone is not a complete sign-in
    await freshStep();
    const step2 = await call("/two-factor/verify-totp", { body: { code: totp(secret) }, ip, cookie: cookiesFrom(step1) });
    expect(step2.status).toBe(200);
    const mine = onlyRb(step2);
    // Attack on the address, then the admin signs in from her browser: the password passes,
    // and the authenticator code is still required.
    await Promise.all(Array.from({ length: 30 }, () => attempt(email)));
    const again = await attempt(email, { password: PASSWORD, cookie: mine });
    expect(again.status).toBe(200);
    expect((await json(again)).twoFactorRedirect).toBe(true);
    expect(cookiesFrom(again)).not.toMatch(/session_token=[^;]/);
  });

  it("has a budget of its own, with the same delay schedule", async () => {
    const email = "rb.budget@nltag.test";
    await verifiedUser(email, PASSWORD);
    const mine = onlyRb(await attempt(email, { password: PASSWORD }));
    const since = new Date();
    expect((await Promise.all(Array.from({ length: 20 }, () => attempt(email, { cookie: mine })))).filter((r) => r.status === 401)).toHaveLength(FREE);
    expect(await auditCount("auth.sign_in.throttled", since, "recognised-browser")).toBe(1);
    // The shared budget was not used by those attempts.
    expect((await attempt(email)).status).toBe(401);
  });

  it("is bound to the address and cannot be forged or edited", async () => {
    const a = "rb.bound.a@nltag.test";
    const b = "rb.bound.b@nltag.test";
    await verifiedUser(a, PASSWORD);
    await verifiedUser(b, PASSWORD);
    const tokenForA = onlyRb(await attempt(a, { password: PASSWORD }));
    await Promise.all(Array.from({ length: FREE }, () => attempt(b)));
    expect((await attempt(b, { password: PASSWORD, cookie: tokenForA })).status).toBe(429); // A's browser token is useless for B
    const [name, value] = tokenForA.split("=") as [string, string];
    const parts = value.split(".");
    const edited = `${name}=${[parts[0], String(Number(parts[1]) + 1), parts[2], parts[3]].join(".")}`;
    const forged = `${name}=1.${Math.floor(Date.now() / 1000)}.${"A".repeat(22)}.${"B".repeat(32)}`;
    await Promise.all(Array.from({ length: FREE }, () => attempt(a)));
    for (const cookie of [edited, forged, `${name}=garbage`]) expect((await attempt(a, { password: PASSWORD, cookie })).status).toBe(429);
    expect((await attempt(a, { password: PASSWORD, cookie: tokenForA })).status).toBe(200);
  });
});

describe("Owner decisions (3 Nov 2026): 30-day lifetime, revocation by secret rotation, no bypass", () => {
  const DAY = 24 * 3600 * 1000;
  /** A token this server would have issued `ageMs` ago for `email`, as the browser would send it. */
  const agedCookie = (email: string, ageMs: number) => `${RB}=${issueRecognisedBrowserToken(hashEmail(email), Date.now() - ageMs)}`;

  it("a recognised browser is honoured through 30 days and expires after, through the sign-in route", async () => {
    const email = "rb.expiry@nltag.test";
    await verifiedUser(email, PASSWORD);
    await Promise.all(Array.from({ length: 30 }, () => attempt(email))); // the address is delayed
    expect((await attempt(email, { password: PASSWORD, cookie: agedCookie(email, 29 * DAY) })).status).toBe(200);
    expect((await attempt(email, { password: PASSWORD, cookie: agedCookie(email, 30 * DAY - 60_000) })).status).toBe(200);
    expect((await attempt(email, { password: PASSWORD, cookie: agedCookie(email, 30 * DAY + 60_000) })).status).toBe(429);
    expect((await attempt(email, { password: PASSWORD, cookie: agedCookie(email, 179 * DAY) })).status).toBe(429); // old 180-day lifetime gone
  });

  it("rotating BETTER_AUTH_SECRET revokes every recognised browser at once", async () => {
    const a = "rb.rotate.a@nltag.test";
    const b = "rb.rotate.b@nltag.test";
    await verifiedUser(a, PASSWORD);
    await verifiedUser(b, PASSWORD);
    const cookies: Record<string, string> = { [a]: onlyRb(await attempt(a, { password: PASSWORD })), [b]: onlyRb(await attempt(b, { password: PASSWORD })) };
    const original = process.env.BETTER_AUTH_SECRET!;
    try {
      process.env.BETTER_AUTH_SECRET = `${original}-rotated`;
      resetServerEnvForTests();
      await clearRateLimits();
      for (const email of [a, b]) {
        await Promise.all(Array.from({ length: 30 }, () => attempt(email)));
        // Before rotation this cookie would have used its own budget (see "signs in with the right
        // password while attackers keep the address delayed"); now it is an unrecognised browser.
        expect((await attempt(email, { password: PASSWORD, cookie: cookies[email] })).status).toBe(429);
      }
    } finally {
      process.env.BETTER_AUTH_SECRET = original;
      resetServerEnvForTests();
    }
  });

  it("concurrent wrong passwords sent WITH a stolen recognised-browser cookie still get exactly the schedule's checks", async () => {
    const email = "rb.race@nltag.test";
    await verifiedUser(email, PASSWORD);
    const mine = onlyRb(await attempt(email, { password: PASSWORD }));
    const results = await Promise.all(Array.from({ length: 40 }, () => attempt(email, { cookie: mine })));
    expect(results.filter((r) => r.status === 401)).toHaveLength(FREE);
    expect(results.filter((r) => r.status === 429)).toHaveLength(40 - FREE);
    // And the shared budget for unrecognised browsers was untouched, and is itself bounded.
    const shared = await Promise.all(Array.from({ length: 40 }, () => attempt(email)));
    expect(shared.filter((r) => r.status === 401)).toHaveLength(FREE);
  });

  it("a recognised browser skips nothing: a wrong password is still 401, and two-factor still needs the code", async () => {
    const email = "rb.noskip@nltag.test";
    const { secret } = await enrollTwoFactor(await verifiedUser(email, PASSWORD));
    const ip = freshIp();
    const step1 = await call("/sign-in/email", { body: { email, password: PASSWORD }, ip });
    await freshStep();
    const mine = onlyRb(await call("/two-factor/verify-totp", { body: { code: totp(secret) }, ip, cookie: cookiesFrom(step1) }));
    expect((await attempt(email, { cookie: mine })).status).toBe(401);
    const again = await attempt(email, { password: PASSWORD, cookie: mine });
    expect(again.status).toBe(200);
    expect((await json(again)).twoFactorRedirect).toBe(true);
    expect(cookiesFrom(again)).not.toMatch(/session_token=[^;]/);
    // A wrong code after the password is refused; only the right code completes sign-in.
    const challenge = cookiesFrom(again, mine);
    expect((await call("/two-factor/verify-totp", { body: { code: wrongCode(secret) }, ip, cookie: challenge })).status).not.toBe(200);
    // The next step's code (the server accepts ±1 step), so it is never the code already used above.
    const done = await call("/two-factor/verify-totp", { body: { code: totp(secret, Date.now(), 1) }, ip, cookie: challenge });
    expect(done.status).toBe(200);
    expect(cookiesFrom(done)).toContain("session_token");
  });

  it("recovery: once the delay has passed, the correct password plus TOTP from a new browser signs in and makes it recognised", async () => {
    const email = "rb.recover@nltag.test";
    const { secret } = await enrollTwoFactor(await verifiedUser(email, PASSWORD));
    await Promise.all(Array.from({ length: FREE + 3 }, () => attempt(email)));
    expect((await attempt(email, { password: PASSWORD })).status).toBe(429); // delayed, no oracle
    // Jump past the longest delay the schedule can impose at this point (well under the 1-hour
    // reset). One fixed instant, a different TOTP step from enrollment, so no replay concerns.
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 16 * 60_000 });
    const ip = freshIp();
    const step1 = await call("/sign-in/email", { body: { email, password: PASSWORD }, ip });
    expect(step1.status).toBe(200);
    expect((await json(step1)).twoFactorRedirect).toBe(true);
    expect(cookiesFrom(step1)).not.toMatch(/session_token=[^;]/);
    const step2 = await call("/two-factor/verify-totp", { body: { code: totp(secret) }, ip, cookie: cookiesFrom(step1) });
    expect(step2.status).toBe(200);
    expect(cookiesFrom(step2)).toContain("session_token");
    expect(rbCookie(step2)).toBeDefined();
  });
});

describe("M1 alerting and L3: bounded audit rows, one email, no account discovery", () => {
  it("writes one audit row per address per hour however many refusals, and one warning email to an existing account", async () => {
    const email = "alert.owner@nltag.test";
    await verifiedUser(email, PASSWORD);
    memoryOutbox.length = 0;
    const since = new Date();
    await Promise.all(Array.from({ length: 50 }, () => attempt(email)));
    await Promise.all(Array.from({ length: 50 }, () => attempt(email)));
    await call("/get-session", { method: "GET" }); // flushes the background email queue
    expect(await auditCount("auth.sign_in.throttled", since)).toBe(1);
    const mails = mailTo(email);
    expect(mails).toHaveLength(1);
    // English only while the Tamil wording awaits owner approval; no link in a security alert.
    expect(mails[0]!.subject).toBe("Repeated wrong sign-in attempts on your account");
    expect(mails[0]!.text).not.toMatch(/https?:\/\//);
    expect(mails[0]!.text).toContain("browser you have signed in with before");
    expect(`${mails[0]!.subject}\n${mails[0]!.text}`).not.toMatch(/[\u0B80-\u0BFF]/); // no Tamil at all, as actually sent
  });

  it("sends nothing for an address with no account, and the responses cannot tell the two apart", async () => {
    const real = "alert.real@nltag.test";
    const none = "alert.nobody@nltag.test";
    await verifiedUser(real, PASSWORD);
    memoryOutbox.length = 0;
    const burst = (email: string) => Promise.all(Array.from({ length: FREE + 3 }, () => attempt(email)));
    const [r, n] = [await burst(real), await burst(none)];
    await call("/get-session", { method: "GET" });
    const shape = async (rs: Response[]) =>
      Promise.all(rs.map(async (x) => [x.status, x.headers.get("retry-after"), x.headers.get("content-type"), await x.clone().text()].join("|")));
    expect((await shape(r)).sort()).toEqual((await shape(n)).sort());
    expect(mailTo(none)).toHaveLength(0);
    expect(mailTo(real)).toHaveLength(1);
  });
});
