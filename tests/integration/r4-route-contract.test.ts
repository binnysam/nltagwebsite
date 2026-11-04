import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getAuth } from "@/server/auth/auth";
import { closeDb, getDb } from "@/server/db/client";
import { AUTH_ROUTES, DENIED_ENDPOINTS } from "@/server/security/auth-routes";
import { resetGateLimitersForTests } from "@/server/security/auth-abuse-gate";
import { seed, SEED_PASSWORD, SEED_USERS } from "../../scripts/db/seed";
import { call, clearRateLimits, signIn } from "./helpers";

const MEMBER = SEED_USERS[2]!.email;

/** Every endpoint Better Auth registers under the real configuration: path → methods. */
function betterAuthEndpoints(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const fn of Object.values(getAuth().api) as Array<{ path?: string; options?: { method?: string | string[]; metadata?: { SERVER_ONLY?: boolean } } }>) {
    if (!fn?.path) continue;
    const m = fn.options?.method;
    const methods = Array.isArray(m) ? m : [m ?? "*"];
    const set = out.get(fn.path) ?? new Set<string>();
    for (const x of methods) set.add(x === "*" ? "GET" : x);
    out.set(fn.path, set);
  }
  return out;
}

const concrete = (path: string) => path.replace(/:[a-zA-Z]+/g, "abcDEF123abcDEF123abcDEF");

beforeAll(async () => {
  await seed();
  await clearRateLimits();
});
beforeEach(() => resetGateLimitersForTests());
afterAll(closeDb);

describe("R4 route table (default deny)", () => {
  it("every Better Auth endpoint is either routed or explicitly denied, and nothing listed is stale", () => {
    const endpoints = betterAuthEndpoints();
    const routed = new Set(AUTH_ROUTES.map((r) => r.path));
    const unclassified = [...endpoints.keys()].filter((p) => !routed.has(p) && !(p in DENIED_ENDPOINTS));
    expect(unclassified, "classify these in src/server/security/auth-routes.ts").toEqual([]);
    const stale = [...routed, ...Object.keys(DENIED_ENDPOINTS)].filter((p) => !endpoints.has(p));
    expect(stale, "no longer registered by Better Auth").toEqual([]);
    for (const r of AUTH_ROUTES) expect(endpoints.get(r.path)?.has(r.method), `${r.method} ${r.path}`).toBe(true);
  });

  it("every denied endpoint returns the gate's own 404 for GET and POST", async () => {
    const results: string[] = [];
    for (const path of Object.keys(DENIED_ENDPOINTS)) {
      for (const method of ["GET", "POST"] as const) {
        const res = await call(concrete(path), { method, body: method === "POST" ? {} : undefined });
        const text = await res.text();
        if (res.status !== 404 || text !== "Not Found" || res.headers.get("content-type") !== "text/plain; charset=utf-8") results.push(`${method} ${path} → ${res.status}`);
      }
    }
    expect(results).toEqual([]);
  });

  it("routed endpoints answer only to their own method", async () => {
    for (const r of AUTH_ROUTES) {
      const other = r.method === "GET" ? "POST" : "GET";
      const res = await call(concrete(r.path), { method: other, body: other === "POST" ? {} : undefined });
      expect(res.status, `${other} ${r.path}`).toBe(404);
    }
  });

  it("path variants are never normalised into a routed path", async () => {
    const variants = ["/sign-in/email/", "/Sign-In/email", "/sign-in//email", "//sign-in/email", "/sign-in/%65mail", "/sign-in/email%2F", "/reset-password/", "/reset-password/abc/def", "/two-factor/verify-totp/", "/api/auth/sign-in/email"];
    for (const v of variants) {
      const res = await call(v, { body: { email: MEMBER, password: SEED_PASSWORD } });
      expect(res.status, v).toBe(404);
    }
    for (const method of ["HEAD", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
      const res = await call("/sign-in/email", { method: method as "GET" });
      expect(res.status, method).toBe(404);
    }
    const q = await call("/sign-in/email?x=1", { body: { email: MEMBER, password: SEED_PASSWORD } });
    expect(q.status).toBe(404);
  });

  it("password-checking endpoints stay closed even with a valid session", async () => {
    const { cookie } = await signIn(MEMBER, SEED_PASSWORD);
    expect(cookie).toContain("session_token");
    for (const path of ["/change-password", "/verify-password", "/two-factor/enable", "/two-factor/disable", "/list-sessions", "/update-user"]) {
      const res = await call(path, { cookie, body: { password: SEED_PASSWORD, currentPassword: SEED_PASSWORD, newPassword: "another-long-password" } });
      expect(res.status, path).toBe(404);
    }
  });

  it("Better Auth's rate_limit table is never written", async () => {
    await call("/sign-in/email", { body: { email: MEMBER, password: "wrong-password-1" } });
    await call("/request-password-reset", { body: { email: MEMBER } });
    const [rows] = (await getDb().execute(sql`SELECT COUNT(*) AS n FROM rate_limit`)) as unknown as [[{ n: number }]];
    expect(Number(rows[0].n)).toBe(0);
  });

  it("accounts off: the route is 404 before the gate", async () => {
    const saved = process.env.NLTAG_ACCOUNTS_ENABLED;
    process.env.NLTAG_ACCOUNTS_ENABLED = "0";
    try {
      const res = await call("/sign-in/email", { body: { email: MEMBER, password: SEED_PASSWORD } });
      expect(res.status).toBe(404);
    } finally {
      process.env.NLTAG_ACCOUNTS_ENABLED = saved;
    }
  });
});
