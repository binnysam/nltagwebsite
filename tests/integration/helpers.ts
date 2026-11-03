import { sql } from "drizzle-orm";
import { GET as routeGET, POST as routePOST } from "@/app/api/auth/[...all]/route";
import { POST as accountRequestPOST } from "@/app/api/account-request/route";
import { getAuth } from "@/server/auth/auth";
import { flushAccountRequestsForTests } from "@/server/auth/request-account";
import { staffRole, user } from "@/server/db/schema";
import { inArray } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { flushEmailQueueForTests } from "@/server/email/send";
import { memoryOutbox } from "@/server/email/transport";
import { flushGateAuditsForTests } from "@/server/security/auth-abuse-gate";
import { SEED_TOTP_SECRET, SEED_USERS } from "../../scripts/db/seed";
import { base32Decode, freshStep, totp } from "../support/totp";

export const ORIGIN = "http://localhost:3000";
let ipCounter = 10;
/** A fresh client IP per test so rate limits do not leak between tests. */
export const freshIp = () => `198.51.100.${ipCounter++ % 250}`;

export interface CallOptions {
  method?: "GET" | "POST";
  body?: unknown;
  ip?: string;
  cookie?: string;
  origin?: string | null;
  headers?: Record<string, string>;
  /** Send only `headers` (no CDN-style X-Forwarded-For / X-Real-IP). For spoofing tests. */
  rawForwarding?: boolean;
}

/**
 * Calls Better Auth exactly as the /api/auth route does (withTrustedClientIpRequest first). By
 * default the request carries the headers Hostinger's CDN adds for a visitor at `ip`: X-Forwarded-For
 * ending in that address and X-Real-IP set to it (vitest.integration.config.ts sets
 * CLIENT_IP_SOURCE=forwarded-chain, CLIENT_IP_PROXY_HOPS=0).
 */
export async function call(path: string, opts: CallOptions = {}) {
  const ip = opts.ip ?? "198.51.100.1";
  const headers = new Headers(opts.rawForwarding ? {} : { "x-forwarded-for": ip, "x-real-ip": ip });
  if (opts.origin !== null) headers.set("origin", opts.origin ?? ORIGIN);
  if (opts.cookie) headers.set("cookie", opts.cookie);
  if (opts.body !== undefined) headers.set("content-type", "application/json");
  for (const [k, v] of Object.entries(opts.headers ?? {})) headers.set(k, v);
  const url = path.startsWith("http") ? path : `${ORIGIN}/api/auth${path}`;
  // Through the real /api/auth route (accounts gate + everything the route does), never
  // getAuth().handler directly: protection that lives in the route must be under test.
  const req = new Request(url, { method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"), headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined, redirect: "manual" });
  const res = await (req.method === "GET" ? routeGET : routePOST)(req);
  await flushGateAuditsForTests();
  await flushEmailQueueForTests();
  return res;
}

/** Turns Set-Cookie response headers into a Cookie request header. */
export function cookiesFrom(res: Response, previous = ""): string {
  const jar = new Map(previous.split("; ").filter(Boolean).map((c) => c.split("=") as [string, string]).map(([k, ...v]) => [k, v.join("=")]));
  for (const line of res.headers.getSetCookie()) {
    const [pair] = line.split(";");
    const [k, ...v] = pair!.split("=");
    jar.set(k!.trim(), v.join("="));
  }
  return [...jar].filter(([, v]) => v !== "").map(([k, v]) => `${k}=${v}`).join("; ");
}

export function mailTo(address: string) {
  return memoryOutbox.filter((m) => m.to === address);
}

export function linkIn(text: string): string {
  const m = text.match(/https?:\/\/\S+/);
  if (!m) throw new Error("no link in email");
  return m[0];
}

/**
 * R4 mailbox-first account request (replaces password sign-up). Same origin, JSON, through the
 * real /api/account-request route; waits for the background job and its mail.
 */
export async function requestAccount(email: string, locale: "ta" | "en" = "en") {
  const res = await accountRequestPOST(
    new Request(`${ORIGIN}/api/account-request`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify({ email, locale }) }),
  );
  await flushAccountRequestsForTests();
  await flushEmailQueueForTests();
  return res;
}

/** The set-password/reset token in the newest mail to this address. */
export function newestLinkToken(email: string): string {
  const mail = mailTo(email).at(-1);
  if (!mail) throw new Error("set-password email missing");
  return new URL(linkIn(mail.text)).pathname.split("/").at(-1)!;
}

/**
 * Mailbox-first fixture: request → set-password link → first password → sign in. The address is
 * put on the allowlist only for the request (eligibility only, D8), then the list is restored.
 * Returns the session cookie, as the old sign-up fixture did.
 */
export async function verifiedUser(email: string, password = "correct-horse-battery") {
  const saved = process.env.NLTAG_SIGNUP_ALLOWLIST;
  process.env.NLTAG_SIGNUP_ALLOWLIST = [saved, email].filter(Boolean).join(",");
  try {
    const req = await requestAccount(email);
    if (req.status !== 202) throw new Error(`account request refused (${req.status})`);
  } finally {
    restoreEnv("NLTAG_SIGNUP_ALLOWLIST", saved);
  }
  const set = await call("/reset-password", { body: { token: newestLinkToken(email), newPassword: password } });
  if (set.status !== 200) throw new Error(`set-password failed (${set.status})`);
  const { res, cookie } = await signIn(email, password);
  if (res.status !== 200 || !cookie.includes("session_token")) throw new Error(`sign-in after set-password failed (${res.status})`);
  return cookie;
}

/**
 * Password sign-in. For a seeded account with two-factor on (the Church Admin) the challenge is
 * completed with the seed's test authenticator, so callers get a normal session as before;
 * pass `{ secondFactor: false }` to stop at the challenge, or `totpSecret` for other accounts.
 */
export async function signIn(email: string, password: string, ip = freshIp(), opts: { secondFactor?: boolean; totpSecret?: string | Uint8Array } = {}) {
  const res = await call("/sign-in/email", { body: { email, password }, ip });
  const cookie = cookiesFrom(res);
  const seeded = SEED_USERS.find((u) => u.email === email)?.twoFactor ? SEED_TOTP_SECRET : undefined;
  const secret = opts.totpSecret ?? seeded;
  if (opts.secondFactor === false || !secret || res.status !== 200) return { res, cookie };
  const body = (await res.clone().json()) as { twoFactorRedirect?: boolean };
  if (!body.twoFactorRedirect) return { res, cookie };
  await freshStep();
  const verified = await call("/two-factor/verify-totp", { body: { code: totp(secret) }, ip, cookie });
  return { res: verified, cookie: cookiesFrom(verified, cookie) };
}

/**
 * Enrolls an authenticator the way the site does: enable and confirm the first code through the
 * server API, exactly as the account page's server actions startEnrollment / confirmEnrollment do.
 * Neither step exists over HTTP: /two-factor/enable is denied (D6) and the gate forwards
 * /two-factor/verify-totp only for a sign-in challenge (v6.1 G1). Returns the new session and secret.
 */
export async function enrollTwoFactor(cookie: string, password = "correct-horse-battery", ip = freshIp()) {
  const enabled = await getAuth().api.enableTwoFactor({ headers: headersWith(cookie, ip), body: { password, method: "totp" } as never });
  if (!("totpURI" in enabled)) throw new Error("enable did not return an authenticator URI");
  const { totpURI, backupCodes } = enabled;
  const secret = base32Decode(new URL(totpURI).searchParams.get("secret")!);
  await freshStep();
  const verify = await getAuth().api.verifyTOTP({ headers: headersWith(cookie, ip), body: { code: totp(secret) }, asResponse: true });
  if (verify.status !== 200) throw new Error(`verify failed (${verify.status})`);
  return { cookie: cookiesFrom(verify, cookie), secret, backupCodes, totpURI };
}

export async function clearRateLimits() {
  await getDb().execute(sql`DELETE FROM rate_limit`);
  await getDb().execute(sql`DELETE FROM rate_limit_bucket`);
}

export function headersWith(cookie: string, ip = "198.51.100.1") {
  return new Headers({ cookie, "x-forwarded-for": ip, "x-real-ip": ip });
}

/**
 * Test isolation: staff roles back to exactly the seed's. Vitest runs files in varying order and
 * other files leave extra Church Admins behind; every file that asserts on roles calls this first.
 */
export async function resetStaffRolesToSeed() {
  const db = getDb();
  await db.delete(staffRole);
  for (const u of SEED_USERS) {
    if (u.roles.length === 0) continue;
    const [row] = await db.select({ id: user.id }).from(user).where(inArray(user.email, [u.email]));
    if (!row) continue;
    for (const role of u.roles) await db.insert(staffRole).values({ userId: row.id, role, grantedByUserId: null, grantedAt: new Date() });
  }
}

/** Restores an environment variable; assigning undefined would store the string "undefined". */
export function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
