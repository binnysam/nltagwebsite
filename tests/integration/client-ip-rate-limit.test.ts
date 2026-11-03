import { desc, eq, like, or } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/server/db/client";
import { auditLog, rateLimit, rateLimitBucket } from "@/server/db/schema";
import { hashEmail, hashIp } from "@/server/security/hash";
import { CLIENT_IP_HEADER } from "@/server/security/client-ip";
import { signInAccountKey, THROTTLES } from "@/server/services/rate-limit";
import { ORIGIN, call, clearRateLimits, freshIp, verifiedUser } from "./helpers";

/**
 * Security fix (Nov 2026): rate limits behind Hostinger's CDN key on the resolved visitor address
 * (docs/backend/client-ip.md), and wrong passwords are also limited per account.
 * The integration config uses the documented CDN layout: CLIENT_IP_SOURCE=forwarded-chain,
 * CLIENT_IP_PROXY_HOPS=0, X-Real-IP cross-check.
 */

afterAll(closeDb);
beforeEach(clearRateLimits);

const WRONG = { password: "definitely-wrong-password" };
const attempt = (email: string, opts: { ip?: string; headers?: Record<string, string>; rawForwarding?: boolean; password?: string } = {}) =>
  call("/sign-in/email", { body: { email, password: opts.password ?? WRONG.password }, ip: opts.ip, headers: opts.headers, rawForwarding: opts.rawForwarding });

async function statuses(n: number, make: (i: number) => Promise<Response>) {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push((await make(i)).status);
  return out;
}

async function betterAuthKeys() {
  return (await getDb().select({ key: rateLimit.key }).from(rateLimit)).map((r) => r.key);
}

describe("per-visitor sign-in limit behind the CDN", () => {
  it("one visitor rotating forged X-Forwarded-For entries is still blocked on the 6th attempt", async () => {
    const real = "203.0.113.20";
    const s = await statuses(6, (i) =>
      attempt("rotator@nltag.test", { rawForwarding: true, headers: { "x-forwarded-for": `192.0.2.${i + 1}, ${real}`, "x-real-ip": real } }),
    );
    expect(s).toEqual([401, 401, 401, 401, 401, 429]);
    const keys = await betterAuthKeys();
    expect(keys).toContain(`${real}|/sign-in/email`);
    expect(keys.some((k) => k.startsWith("192.0.2."))).toBe(false);
  });

  it("a forged internal client-IP header changes nothing", async () => {
    const real = "203.0.113.21";
    const s = await statuses(6, (i) =>
      attempt("forger@nltag.test", { rawForwarding: true, headers: { [CLIENT_IP_HEADER]: `192.0.2.${i + 1}`, "x-forwarded-for": real, "x-real-ip": real } }),
    );
    expect(s).toEqual([401, 401, 401, 401, 401, 429]);
    expect((await betterAuthKeys()).some((k) => k.startsWith("192.0.2."))).toBe(false);
  });

  it("different visitors do not block one another", async () => {
    const a = "203.0.113.30";
    const b = "198.51.100.230";
    expect(await statuses(6, () => attempt("visitor.a@nltag.test", { ip: a }))).toEqual([401, 401, 401, 401, 401, 429]);
    expect((await attempt("visitor.b@nltag.test", { ip: b })).status).toBe(401);
    expect((await attempt("visitor.a@nltag.test", { ip: a })).status).toBe(429);
  });

  it("IPv4 and IPv4-mapped IPv6 are the same visitor", async () => {
    const s = await statuses(6, (i) => attempt("mapped@nltag.test", { ip: i % 2 ? "::ffff:203.0.113.40" : "203.0.113.40" }));
    expect(s.at(-1)).toBe(429);
  });

  it("IPv6 visitors are counted per /64: same /64 shares, another /64 does not", async () => {
    const s = await statuses(6, (i) => attempt("v6@nltag.test", { ip: `2001:db8:aa:1::${i + 1}` }));
    expect(s).toEqual([401, 401, 401, 401, 401, 429]);
    // Another address, so the per-account delay (5 free checks) is not what is being measured.
    expect((await attempt("v6.other@nltag.test", { ip: "2001:db8:aa:2::1" })).status).toBe(401);
  });
});

describe("unresolved client IP fails closed", () => {
  it("requests whose address cannot be trusted share one bucket and are still limited", async () => {
    const forged: Record<string, string>[] = [
      { "x-forwarded-for": "192.0.2.1" }, // no X-Real-IP
      { "x-forwarded-for": "192.0.2.2", "x-real-ip": "192.0.2.99" }, // mismatch
      { "x-real-ip": "192.0.2.3" }, // no X-Forwarded-For
      { "x-forwarded-for": "garbage", "x-real-ip": "garbage" },
      { [CLIENT_IP_HEADER]: "192.0.2.5" }, // only the internal header
      {},
    ];
    const s = await statuses(6, (i) => attempt(`unresolved${i}@nltag.test`, { rawForwarding: true, headers: forged[i]! }));
    expect(s).toEqual([401, 401, 401, 401, 401, 429]);
    // One shared key (Better Auth's fallback), never an address the caller chose.
    const keys = await betterAuthKeys();
    expect(keys.filter((k) => k.endsWith("|/sign-in/email"))).toHaveLength(1);
    expect(keys.some((k) => k.includes("192.0.2."))).toBe(false);
  });
});

describe("per-account sign-in protection (any IP) — see sign-in-protection.test.ts for H1 and M1", () => {
  const free = THROTTLES.signInAccount.free;

  it("throttles an address after its free attempts from different addresses, the right password included", async () => {
    const email = "acct.target@nltag.test";
    await verifiedUser(email, "correct-horse-battery");
    expect(await statuses(free, () => attempt(email, { ip: freshIp() }))).toEqual(Array(free).fill(401));
    const blocked = await attempt(email, { ip: freshIp(), password: "correct-horse-battery" });
    expect(blocked.status).toBe(429);
    expect(((await blocked.json()) as { code?: string }).code).toBe("TOO_MANY_ATTEMPTS");
    // Another account from the same addresses is unaffected.
    expect((await attempt("someone.else@nltag.test", { ip: freshIp() })).status).toBe(401);
  });

  it("matches the address regardless of letter case", async () => {
    const email = "Case.Mix@nltag.test";
    expect(await statuses(free, (i) => attempt(i % 2 ? email.toUpperCase() : email.toLowerCase(), { ip: freshIp() }))).toEqual(Array(free).fill(401));
    expect((await attempt("case.mix@NLTAG.test", { ip: freshIp() })).status).toBe(429);
  });

  it("does not count malformed requests (refused before any password check)", async () => {
    const email = "malformed@nltag.test";
    const bad = await statuses(free + 2, () => attempt(` ${email} `, { ip: freshIp() }));
    expect(bad.every((s) => s === 400)).toBe(true);
    expect((await attempt(email, { ip: freshIp() })).status).toBe(401);
  });

  it("stores only a keyed hash of the address and audits the refusal without it", async () => {
    const email = "acct.privacy@nltag.test";
    await statuses(free + 1, () => attempt(email, { ip: freshIp() }));
    const buckets = await getDb().select({ k: rateLimitBucket.bucketKey }).from(rateLimitBucket);
    expect(buckets.map((b) => b.k)).toContain(signInAccountKey(hashEmail(email)));
    expect(buckets.some((b) => b.k.includes("@") || b.k.includes("privacy"))).toBe(false);
    const [row] = await getDb().select().from(auditLog).where(eq(auditLog.action, "auth.sign_in.throttled")).orderBy(desc(auditLog.createdAt)).limit(1);
    expect(row).toBeDefined();
    expect(JSON.stringify(row)).not.toContain("@");
  });
});

describe("audit rows use the same resolved address", () => {
  it("hashes the CDN-provided address, never the caller's leftmost entry", async () => {
    const real = "203.0.113.50";
    await attempt("audit.ip@nltag.test", { rawForwarding: true, headers: { "x-forwarded-for": `192.0.2.77, ${real}`, "x-real-ip": real } });
    const [row] = await getDb().select().from(auditLog).where(eq(auditLog.action, "auth.sign_in.fail")).orderBy(desc(auditLog.createdAt)).limit(1);
    expect(row?.ipHash).toBe(hashIp(real));
    expect(row?.ipHash).not.toBe(hashIp("192.0.2.77"));
  });

  it("records no IP at all when the address cannot be trusted", async () => {
    await attempt("audit.none@nltag.test", { rawForwarding: true, headers: { "x-forwarded-for": "192.0.2.78" } });
    const [row] = await getDb().select().from(auditLog).where(eq(auditLog.action, "auth.sign_in.fail")).orderBy(desc(auditLog.createdAt)).limit(1);
    expect(row?.ipHash).toBeNull();
  });
});

describe("the real /api/auth route", () => {
  it("rebuilds the client IP itself, so a forged internal header cannot pick a bucket", async () => {
    const prev = process.env.NLTAG_ACCOUNTS_ENABLED;
    process.env.NLTAG_ACCOUNTS_ENABLED = "1";
    try {
      const { POST } = await import("@/app/api/auth/[...all]/route");
      const real = "203.0.113.60";
      const s = await statuses(6, (i) =>
        POST(
          new Request(`${ORIGIN}/api/auth/sign-in/email`, {
            method: "POST",
            headers: { origin: ORIGIN, "content-type": "application/json", [CLIENT_IP_HEADER]: `192.0.2.${100 + i}`, "x-forwarded-for": `192.0.2.${i}, ${real}`, "x-real-ip": real },
            body: JSON.stringify({ email: "route.check@nltag.test", password: WRONG.password }),
          }),
        ),
      );
      expect(s).toEqual([401, 401, 401, 401, 401, 429]);
      const rows = await getDb().select({ key: rateLimit.key }).from(rateLimit).where(or(like(rateLimit.key, "192.0.2.%"), like(rateLimit.key, `${real}|%`)));
      expect(rows.map((r) => r.key)).toEqual([`${real}|/sign-in/email`]);
    } finally {
      if (prev === undefined) delete process.env.NLTAG_ACCOUNTS_ENABLED;
      else process.env.NLTAG_ACCOUNTS_ENABLED = prev;
    }
  });
});
