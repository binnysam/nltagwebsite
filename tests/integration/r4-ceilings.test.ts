import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/server/db/client";
import { rateLimitBucket } from "@/server/db/schema";
import { CLASS_CEILINGS, resetGateLimitersForTests } from "@/server/security/auth-abuse-gate";
import { hashEmail } from "@/server/security/hash";
import { releaseWindow, reserveWindow, signInAccountKey } from "@/server/services/rate-limit";
import { call, clearRateLimits, verifiedUser } from "./helpers";

/** v4 E2.1–E2.3, ported to the v6 gate (D12: ceilings and A-to-K fallback retained). */

const PASSWORD = "correct-horse-battery";
const RB = "nltag_rb";
const attempt = (email: string, password = "wrong-password-z", cookie?: string) => call("/sign-in/email", { body: { email, password }, cookie });
const onlyRb = (res: Response) => res.headers.getSetCookie().find((c) => c.startsWith(`${RB}=`))!.split(";")[0]!;

async function fill(cls: "K" | "A") {
  const now = Date.now();
  for (const rule of CLASS_CEILINGS[cls]) {
    const ms = rule.window * 1000;
    const start = Math.floor(now / ms) * ms;
    await getDb().execute(sql`INSERT INTO rate_limit_bucket (bucket_key, window_start, count, expires_at) VALUES (${`class:${cls}:${rule.window}`}, ${start}, ${rule.max}, ${new Date(start + ms)}) ON DUPLICATE KEY UPDATE count = ${rule.max}`);
  }
}
const countOf = async (key: string) => (await getDb().select({ c: rateLimitBucket.count }).from(rateLimitBucket).where(eq(rateLimitBucket.bucketKey, key)))[0]?.c ?? 0;

beforeEach(async () => {
  await clearRateLimits();
  resetGateLimitersForTests();
});
afterAll(closeDb);

describe("R4 class ceilings (E2, retained)", () => {
  it("E2.1 reserveWindow: 91 concurrent on a limit of 90 → exactly 90; one release gives exactly one back", async () => {
    const rule = { window: 900, max: 90 };
    const now = Date.now();
    const r = await Promise.all(Array.from({ length: 91 }, () => reserveWindow("e21", rule, now)));
    expect(r.filter((x) => x.allowed)).toHaveLength(90);
    await releaseWindow("e21", r[0]!.windowStart);
    expect((await reserveWindow("e21", rule, now)).allowed).toBe(true);
    expect((await reserveWindow("e21", rule, now)).allowed).toBe(false);
  });

  it("E2.2 A ceiling full: the owner's recognised browser falls back to the address's K budget (401, not 429); correct password 200", async () => {
    const email = "ceiling.a@nltag.test";
    await verifiedUser(email, PASSWORD);
    const rb = onlyRb(await attempt(email, PASSWORD));
    await clearRateLimits();
    await fill("A");
    const wrong = await attempt(email, "wrong-password-z", rb);
    expect(wrong.status).toBe(401);
    expect(await countOf(signInAccountKey(hashEmail(email)))).toBe(1); // charged to K
    const [rbRows] = (await getDb().execute(sql`SELECT COUNT(*) AS n FROM rate_limit_bucket WHERE bucket_key LIKE 'signin-dev:%' AND count > 0`)) as unknown as [[{ n: number }]];
    expect(Number(rbRows[0].n)).toBe(0); // no recognised-browser reservation left behind
    expect((await attempt(email, PASSWORD, rb)).status).toBe(200);
  });

  it("E2.3 K ceiling full: known address 429 with Retry-After and its reservation given back; unknown address gets the same status", async () => {
    const email = "ceiling.k@nltag.test";
    await verifiedUser(email, PASSWORD);
    await clearRateLimits();
    await fill("K");
    const k = await attempt(email);
    const u = await attempt("ceiling.nobody@nltag.test");
    expect(k.status).toBe(429);
    expect(Number(k.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(u.status).toBe(429);
    expect(await countOf(signInAccountKey(hashEmail(email)))).toBe(0);
    expect(await countOf(signInAccountKey(hashEmail("ceiling.nobody@nltag.test")))).toBe(0);
  });

  it("E2.3b 200 malformed sign-ins leave every counter at 0", async () => {
    for (let i = 0; i < 200; i++) await call("/sign-in/email", { body: i % 2 ? { email: "x@nltag.test" } : { email: "x@nltag.test", password: "p", extra: 1 } });
    const [rows] = (await getDb().execute(sql`SELECT COALESCE(SUM(count), 0) AS n FROM rate_limit_bucket`)) as unknown as [[{ n: number }]];
    expect(Number(rows[0].n)).toBe(0);
  });

  it("correct passwords give the class slots back (wrong passwords only count)", async () => {
    const email = "ceiling.ok@nltag.test";
    await verifiedUser(email, PASSWORD);
    await clearRateLimits();
    await attempt(email);
    expect(await countOf("class:K:900")).toBe(1);
    await attempt(email, PASSWORD);
    expect(await countOf("class:K:900")).toBe(1);
    expect(await getDb().select().from(rateLimitBucket).where(and(eq(rateLimitBucket.bucketKey, "class:K:3600")))).toHaveLength(1);
  });
});
