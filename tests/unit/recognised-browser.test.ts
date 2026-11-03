// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetServerEnvForTests } from "@/server/env";
import { hashEmail } from "@/server/security/hash";
import {
  issueRecognisedBrowserToken,
  RECOGNISED_BROWSER_MAX_AGE_SECONDS,
  recognisedBrowserCookieName,
  recognisedBrowserCookieOptions,
  recognisedBrowserId,
} from "@/server/auth/recognised-browser";

/**
 * Recognised-browser token (owner decision 3 Nov 2026: approved, 30-day maximum, HttpOnly, Secure
 * in production, SameSite, bound to the account, skips nothing, no individual revocation).
 * The route-level behaviour is in tests/integration/sign-in-protection.test.ts.
 */

const SECRET_A = "unit-test-secret-a-0123456789-0123456789";
const SECRET_B = "unit-test-secret-b-0123456789-0123456789";
const DAY = 24 * 3600 * 1000;
const NOW = Date.UTC(2026, 10, 3, 6, 0, 0);

function useSecret(secret: string) {
  vi.stubEnv("BETTER_AUTH_SECRET", secret);
  resetServerEnvForTests();
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("DATABASE_URL", "mysql://unit:unit@127.0.0.1:3306/unit");
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  useSecret(SECRET_A);
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetServerEnvForTests();
});

describe("lifetime: 30 days at most", () => {
  it("is 30 days", () => {
    expect(RECOGNISED_BROWSER_MAX_AGE_SECONDS).toBe(30 * 24 * 3600);
    expect(recognisedBrowserCookieOptions(true).maxAge).toBe(2_592_000);
  });

  it("is accepted up to 30 days after issue and refused after, even if the browser kept the cookie", () => {
    const emailHash = hashEmail("owner@nltag.test");
    const token = issueRecognisedBrowserToken(emailHash, NOW);
    expect(recognisedBrowserId(token, emailHash, NOW)).not.toBeNull();
    expect(recognisedBrowserId(token, emailHash, NOW + 29 * DAY)).not.toBeNull();
    expect(recognisedBrowserId(token, emailHash, NOW + 30 * DAY)).not.toBeNull(); // the last second
    expect(recognisedBrowserId(token, emailHash, NOW + 30 * DAY + 1000)).toBeNull();
    expect(recognisedBrowserId(token, emailHash, NOW + 180 * DAY)).toBeNull(); // the old 180-day lifetime is gone
  });

  it("refuses a token dated in the future (beyond one minute of clock skew)", () => {
    const emailHash = hashEmail("owner@nltag.test");
    expect(recognisedBrowserId(issueRecognisedBrowserToken(emailHash, NOW + 2 * 60_000), emailHash, NOW)).toBeNull();
  });
});

describe("revocation: rotating BETTER_AUTH_SECRET revokes every token", () => {
  it("a token issued under the old secret is refused under the new one, for every address", () => {
    const addresses = ["admin@nltag.test", "editor@nltag.test"];
    const tokens = addresses.map((a) => issueRecognisedBrowserToken(hashEmail(a), NOW));
    addresses.forEach((a, i) => expect(recognisedBrowserId(tokens[i], hashEmail(a), NOW)).not.toBeNull());
    useSecret(SECRET_B);
    addresses.forEach((a, i) => expect(recognisedBrowserId(tokens[i], hashEmail(a), NOW)).toBeNull());
    // Rotating back is not a recovery path we rely on, but it shows nothing else changed.
    useSecret(SECRET_A);
    addresses.forEach((a, i) => expect(recognisedBrowserId(tokens[i], hashEmail(a), NOW)).not.toBeNull());
  });

  it("tokens issued after the rotation work normally", () => {
    useSecret(SECRET_B);
    const emailHash = hashEmail("admin@nltag.test");
    expect(recognisedBrowserId(issueRecognisedBrowserToken(emailHash, NOW), emailHash, NOW)).not.toBeNull();
  });
});

describe("bound to the account", () => {
  it("a token for one address is refused for another", () => {
    const token = issueRecognisedBrowserToken(hashEmail("a@nltag.test"), NOW);
    expect(recognisedBrowserId(token, hashEmail("b@nltag.test"), NOW)).toBeNull();
  });

  it("the token does not contain the address or its hash", () => {
    const emailHash = hashEmail("a@nltag.test");
    const token = issueRecognisedBrowserToken(emailHash, NOW);
    expect(token).not.toContain("a@nltag.test");
    expect(token).not.toContain(emailHash.slice(0, 12));
  });
});

describe("cookie attributes", () => {
  it("production: __Secure- name, HttpOnly, Secure, SameSite=Strict, path /api/auth, 30 days", () => {
    expect(recognisedBrowserCookieName(true)).toBe("__Secure-nltag_rb");
    expect(recognisedBrowserCookieOptions(true)).toEqual({ httpOnly: true, secure: true, sameSite: "strict", path: "/api/auth", maxAge: 2_592_000 });
  });

  it("local development: same attributes without Secure (plain http://localhost)", () => {
    expect(recognisedBrowserCookieName(false)).toBe("nltag_rb");
    expect(recognisedBrowserCookieOptions(false)).toEqual({ httpOnly: true, secure: false, sameSite: "strict", path: "/api/auth", maxAge: 2_592_000 });
  });
});
