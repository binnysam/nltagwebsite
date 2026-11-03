import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/auth/[...all]/route";
import { closeDb, getDb } from "@/server/db/client";
import { auditLog, rateLimit, rateLimitBucket } from "@/server/db/schema";
import { resetGateLimitersForTests } from "@/server/security/auth-abuse-gate";
import { CLIENT_IP_HEADER } from "@/server/security/client-ip";
import { hashIp } from "@/server/security/hash";
import { clearRateLimits } from "../integration/helpers";

/**
 * R4 rewrite of L4 (class D): under NODE_ENV=production, through the real /api/auth route and gate.
 * b48261d asserted Better Auth's shared `no-trusted-ip|<path>` bucket. R4 removes that bucket (it let
 * anyone close a path for everyone): limits are per address, keyed by an HMAC, never by an IP, and a
 * caller-supplied address never reaches any key. The client IP is used for audit hashes only.
 */

const ORIGIN = "http://localhost:3000";
const saved = { ...process.env };
const PROD_ENV = {
  NLTAG_ACCOUNTS_ENABLED: "1",
  SMTP_HOST: "smtp.example.test",
  SMTP_USER: "u",
  SMTP_PASS: "p",
  SMTP_FROM: "NLTAG <u@example.test>",
  NLTAG_SIGNUP_ALLOWLIST: "listed.prod@nltag.test",
};
beforeAll(() => Object.assign(process.env, PROD_ENV));
afterAll(closeDb);
beforeEach(async () => {
  await clearRateLimits();
  resetGateLimitersForTests();
});
afterEach(() => {
  for (const k of ["CLIENT_IP_SOURCE", "CLIENT_IP_PROXY_HOPS", "CLIENT_IP_CROSSCHECK"]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const signIn = async (email: string, headers: Record<string, string> = {}) => {
  const res = await POST(
    new Request(`${ORIGIN}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json", ...headers },
      body: JSON.stringify({ email, password: "definitely-wrong-password" }),
    }),
  );
  return { status: res.status, body: await res.text() };
};

const betterAuthRows = async () => (await getDb().select({ key: rateLimit.key }).from(rateLimit)).length;
const bucketKeys = async () => (await getDb().select({ key: rateLimitBucket.bucketKey }).from(rateLimitBucket)).map((r) => r.key);

async function sixForged(email: (i: number) => string) {
  const out: number[] = [];
  for (let i = 0; i < 6; i++) {
    const ip = `192.0.2.${i + 1}`;
    out.push((await signIn(email(i), { "x-forwarded-for": ip, "x-real-ip": ip, [CLIENT_IP_HEADER]: ip })).status);
  }
  return out;
}

describe("production mode, R4 (rewritten L4)", () => {
  it("runs with NODE_ENV=production and accounts open", () => {
    expect(process.env.NODE_ENV).toBe("production");
  });

  it("resolution off (the production default): rotating forged IPs on ONE address get the address schedule; no IP in any key", async () => {
    delete process.env.CLIENT_IP_SOURCE;
    expect(await sixForged(() => "target.prod@nltag.test")).toEqual([401, 401, 401, 401, 401, 429]);
    expect(await betterAuthRows()).toBe(0);
    const keys = await bucketKeys();
    expect(keys.some((k) => /192\.0\.2|no-trusted-ip/.test(k))).toBe(false);
  });

  it("no shared bucket: six different addresses from forged IPs are each answered 401 (one cannot close sign-in for another)", async () => {
    delete process.env.CLIENT_IP_SOURCE;
    expect(await sixForged((i) => `other${i}.prod@nltag.test`)).toEqual([401, 401, 401, 401, 401, 401]);
    expect(await betterAuthRows()).toBe(0);
  });

  it("CLIENT_IP_CROSSCHECK=none or hops too high: the forged address never reaches a key or an audit hash", async () => {
    Object.assign(process.env, { CLIENT_IP_SOURCE: "forwarded-chain", CLIENT_IP_PROXY_HOPS: "0", CLIENT_IP_CROSSCHECK: "none" });
    expect(await sixForged(() => "listed.prod@nltag.test")).toEqual([401, 401, 401, 401, 401, 429]);
    Object.assign(process.env, { CLIENT_IP_SOURCE: "forwarded-chain", CLIENT_IP_PROXY_HOPS: "1", CLIENT_IP_CROSSCHECK: "x-real-ip" });
    await clearRateLimits();
    await signIn("listed.prod@nltag.test", { "x-forwarded-for": "192.0.2.9, 203.0.113.9", "x-real-ip": "192.0.2.9" });
    const forged = ["192.0.2.1", "192.0.2.9", "203.0.113.9"].map((ip) => hashIp(ip));
    const rows = await getDb().select({ ip: auditLog.ipHash }).from(auditLog).where(sql`${auditLog.createdAt} > NOW() - INTERVAL 5 MINUTE`);
    expect(rows.some((r) => forged.includes(r.ip))).toBe(false);
  });

  it("listed address with no account (K) and unknown address (U): identical answers in production", async () => {
    delete process.env.CLIENT_IP_SOURCE;
    const k = await signIn("listed.prod@nltag.test");
    const u = await signIn("nobody.prod@nltag.test");
    expect(k).toEqual(u);
    expect(k.status).toBe(401);
  });

  it("denied endpoints are the gate's 404 in production", async () => {
    for (const path of ["/sign-up/email", "/verify-password", "/change-password", "/sign-in/social", "/two-factor/enable"]) {
      const res = await POST(new Request(`${ORIGIN}/api/auth${path}`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: "{}" }));
      expect(res.status, path).toBe(404);
    }
  });
});
