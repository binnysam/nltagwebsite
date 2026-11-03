import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { getAuth } from "@/server/auth/auth";
import { closeDb, getDb } from "@/server/db/client";
import { rateLimit } from "@/server/db/schema";
import { CLIENT_IP_HEADER, withTrustedClientIpRequest } from "@/server/security/client-ip";
import { clearRateLimits } from "../integration/helpers";

/**
 * L4: under NODE_ENV=production, a request whose address cannot be trusted is counted in Better
 * Auth's real fail-closed bucket, `no-trusted-ip|<path>` (not the 127.0.0.1 fallback that test mode
 * uses), so forged or rotating headers share one limit with everyone else.
 */

const ORIGIN = "http://localhost:3000";
const saved = { ...process.env };
afterAll(closeDb);
beforeEach(clearRateLimits);
afterEach(() => {
  for (const k of ["CLIENT_IP_SOURCE", "CLIENT_IP_PROXY_HOPS", "CLIENT_IP_CROSSCHECK"]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const signIn = (i: number, headers: Record<string, string>) =>
  getAuth().handler(
    withTrustedClientIpRequest(
      new Request(`${ORIGIN}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { origin: ORIGIN, "content-type": "application/json", ...headers },
        body: JSON.stringify({ email: `prod.failclosed.${i}@nltag.test`, password: "definitely-wrong-password" }),
      }),
    ),
  );

const keys = async () => (await getDb().select({ key: rateLimit.key }).from(rateLimit)).map((r) => r.key);

async function sixForged() {
  const out: number[] = [];
  for (let i = 0; i < 6; i++) {
    const ip = `192.0.2.${i + 1}`;
    out.push((await signIn(i, { "x-forwarded-for": ip, "x-real-ip": ip, [CLIENT_IP_HEADER]: ip })).status);
  }
  return out;
}

describe("production mode fails closed (L4)", () => {
  it("runs with NODE_ENV=production", () => {
    expect(process.env.NODE_ENV).toBe("production");
  });

  it("resolution off (the production default): rotating forged headers share no-trusted-ip and are limited", async () => {
    delete process.env.CLIENT_IP_SOURCE;
    expect(await sixForged()).toEqual([401, 401, 401, 401, 401, 429]);
    expect(await keys()).toEqual(["no-trusted-ip|/sign-in/email"]);
  });

  it("CLIENT_IP_CROSSCHECK=none is refused in production: same shared bucket, never the caller's address", async () => {
    Object.assign(process.env, { CLIENT_IP_SOURCE: "forwarded-chain", CLIENT_IP_PROXY_HOPS: "0", CLIENT_IP_CROSSCHECK: "none" });
    expect(await sixForged()).toEqual([401, 401, 401, 401, 401, 429]);
    expect(await keys()).toEqual(["no-trusted-ip|/sign-in/email"]);
  });

  it("hops too high with a caller-written X-Forwarded-For entry: shared bucket", async () => {
    Object.assign(process.env, { CLIENT_IP_SOURCE: "forwarded-chain", CLIENT_IP_PROXY_HOPS: "1", CLIENT_IP_CROSSCHECK: "x-real-ip" });
    const out: number[] = [];
    for (let i = 0; i < 6; i++) out.push((await signIn(i, { "x-forwarded-for": `192.0.2.${i + 1}, 203.0.113.9`, "x-real-ip": `192.0.2.${i + 1}` })).status);
    expect(out).toEqual([401, 401, 401, 401, 401, 429]);
    expect(await keys()).toEqual(["no-trusted-ip|/sign-in/email"]);
  });

  it("a correct configuration still gives each visitor their own bucket (sanity check)", async () => {
    Object.assign(process.env, { CLIENT_IP_SOURCE: "forwarded-chain", CLIENT_IP_PROXY_HOPS: "0", CLIENT_IP_CROSSCHECK: "x-real-ip" });
    await signIn(0, { "x-forwarded-for": "203.0.113.70", "x-real-ip": "203.0.113.70" });
    expect(await keys()).toEqual(["203.0.113.70|/sign-in/email"]);
  });
});
