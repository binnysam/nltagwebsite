import { sql } from "drizzle-orm";
import { getAuth } from "@/server/auth/auth";
import { getDb } from "@/server/db/client";
import { flushEmailQueueForTests } from "@/server/email/send";
import { memoryOutbox } from "@/server/email/transport";
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
}

export async function call(path: string, opts: CallOptions = {}) {
  const headers = new Headers({ "x-forwarded-for": opts.ip ?? "198.51.100.1" });
  if (opts.origin !== null) headers.set("origin", opts.origin ?? ORIGIN);
  if (opts.cookie) headers.set("cookie", opts.cookie);
  if (opts.body !== undefined) headers.set("content-type", "application/json");
  for (const [k, v] of Object.entries(opts.headers ?? {})) headers.set(k, v);
  const url = path.startsWith("http") ? path : `${ORIGIN}/api/auth${path}`;
  const res = await getAuth().handler(
    new Request(url, { method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"), headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined, redirect: "manual" }),
  );
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

export async function signUp(email: string, password = "correct-horse-battery", ip = freshIp(), name = "Test Person A") {
  return call("/sign-up/email", { body: { email, password, name }, ip });
}

/** Signs up, verifies by the emailed link and returns the session cookie. */
export async function verifiedUser(email: string, password = "correct-horse-battery") {
  const ip = freshIp();
  await signUp(email, password, ip);
  const mail = mailTo(email).at(-1);
  if (!mail) throw new Error("verification email missing");
  const res = await call(linkIn(mail.text), { method: "GET", ip });
  const cookie = cookiesFrom(res);
  if (!cookie.includes("session_token")) throw new Error(`verification did not sign in (${res.status})`);
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

/** Enrolls an authenticator for a signed-in account over HTTP; returns the new session and secret. */
export async function enrollTwoFactor(cookie: string, password = "correct-horse-battery", ip = freshIp()) {
  const enable = await call("/two-factor/enable", { body: { password }, ip, cookie });
  if (enable.status !== 200) throw new Error(`enable failed (${enable.status})`);
  const { totpURI, backupCodes } = (await enable.json()) as { totpURI: string; backupCodes: string[] };
  const secret = base32Decode(new URL(totpURI).searchParams.get("secret")!);
  await freshStep();
  const verify = await call("/two-factor/verify-totp", { body: { code: totp(secret) }, ip, cookie });
  if (verify.status !== 200) throw new Error(`verify failed (${verify.status})`);
  return { cookie: cookiesFrom(verify, cookie), secret, backupCodes, totpURI };
}

export async function clearRateLimits() {
  await getDb().execute(sql`DELETE FROM rate_limit`);
  await getDb().execute(sql`DELETE FROM rate_limit_bucket`);
}

export function headersWith(cookie: string, ip = "198.51.100.1") {
  return new Headers({ cookie, "x-forwarded-for": ip });
}
