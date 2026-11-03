import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { serverEnv } from "../env";

/**
 * Recognised browser (M1, Nov 2026; docs/backend/data-and-auth.md → "Sign-in protection").
 *
 * After a COMPLETE sign-in (password, and the authenticator code when two-factor is on) the
 * browser receives a signed token bound to that account's address. When the same browser signs in
 * to the same address again, its password checks are counted in a budget of its own instead of the
 * account's shared budget. An attacker who only knows the address can slow the shared budget down
 * but cannot touch this one, so the account holder is never locked out of a browser they use.
 *
 * It is NOT a trusted device: it skips nothing. Password and (for Church Admins) the authenticator
 * code are still required every time. It only decides which delay budget a password check uses.
 *
 * Stateless (no table, no migration): `1.<issued-at>.<random id>.<HMAC>` where the HMAC covers the
 * account's keyed email hash, so a token is useless for any other address and reveals nothing.
 * Up to MAX_TOKENS tokens per browser (people who look after more than one staff account).
 *
 * Owner decision (3 Nov 2026): approved with a 30-day maximum lifetime, enforced twice — the
 * cookie's Max-Age and the issued-at check below, so a cookie kept past its Max-Age is refused.
 * There is no individual revocation (no table to revoke from): rotating BETTER_AUTH_SECRET
 * invalidates every token at once (and, with it, every session and rate-limit key).
 */

export const RECOGNISED_BROWSER_MAX_AGE_SECONDS = 30 * 24 * 3600;
const MAX_TOKENS = 4;
const VERSION = "1";
const ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;

/** `__Secure-` prefix in production (HTTPS only). Path /api/auth: never sent to pages. */
export const recognisedBrowserCookieName = (isProd: boolean) => (isProd ? "__Secure-nltag_rb" : "nltag_rb");
export const RECOGNISED_BROWSER_COOKIE_PATH = "/api/auth";

/**
 * HttpOnly (no script can read it), Secure in production (the `__Secure-` name also requires it),
 * SameSite=Strict (never sent on a request started by another site; it is only needed on the
 * site's own sign-in calls), narrow path, 30 days.
 */
export const recognisedBrowserCookieOptions = (isProd: boolean) =>
  ({ httpOnly: true, secure: isProd, sameSite: "strict", path: RECOGNISED_BROWSER_COOKIE_PATH, maxAge: RECOGNISED_BROWSER_MAX_AGE_SECONDS }) as const;

/**
 * Revocation without touching BETTER_AUTH_SECRET (R6): NLTAG_RECOGNISED_BROWSER_KEY_VERSION (a
 * positive integer, default 1) is part of the HMAC key derivation. Raising it in hPanel and
 * restarting makes every existing token fail verification; sessions, authenticator secrets and
 * recovery codes are untouched. Lowering it again restores the old tokens, so only ever raise it.
 */
export function recognisedBrowserKeyVersion(env: NodeJS.ProcessEnv = process.env): number | "invalid" {
  const raw = env.NLTAG_RECOGNISED_BROWSER_KEY_VERSION?.trim();
  if (!raw) return 1;
  return /^[1-9][0-9]{0,8}$/.test(raw) ? Number(raw) : "invalid";
}

/** A mistyped version must never break sign-in: it revokes everything instead (fail closed). */
const invalidVersionKey = randomBytes(32);
let invalidWarned = false;

function mac(emailHash: string, issuedAt: number, id: string): string {
  const version = recognisedBrowserKeyVersion();
  if (version === "invalid" && !invalidWarned) {
    invalidWarned = true;
    console.warn("NLTAG_RECOGNISED_BROWSER_KEY_VERSION is not a positive integer; no recognised browser is accepted until it is fixed.");
  }
  const key = version === "invalid" ? invalidVersionKey : createHmac("sha256", serverEnv().BETTER_AUTH_SECRET).update(`nltag:recognised-browser-key:${version}`).digest();
  return createHmac("sha256", key).update(`recognised-browser:v${VERSION}|${emailHash}|${issuedAt}|${id}`).digest("base64url").slice(0, 32);
}

export function issueRecognisedBrowserToken(emailHash: string, now = Date.now()): string {
  const issuedAt = Math.floor(now / 1000);
  const id = randomBytes(16).toString("base64url");
  return `${VERSION}.${issuedAt}.${id}.${mac(emailHash, issuedAt, id)}`;
}

/** The random id of the first valid, unexpired token for this address, or null. */
export function recognisedBrowserId(cookieValue: string | null | undefined, emailHash: string, now = Date.now()): string | null {
  if (recognisedBrowserKeyVersion() === "invalid") {
    mac(emailHash, 0, ""); // logs the configuration problem once
    return null; // fail closed: a mistyped version revokes everything and never breaks sign-in
  }
  for (const token of splitTokens(cookieValue)) {
    const [v, iat, id, sig] = token.split(".");
    if (v !== VERSION || !iat || !/^\d{1,12}$/.test(iat) || !id || !ID_PATTERN.test(id) || !sig) continue;
    const issuedAt = Number(iat);
    if (issuedAt * 1000 > now + 60_000 || now - issuedAt * 1000 > RECOGNISED_BROWSER_MAX_AGE_SECONDS * 1000) continue;
    const expected = Buffer.from(mac(emailHash, issuedAt, id));
    const given = Buffer.from(sig);
    if (given.length === expected.length && timingSafeEqual(given, expected)) return id;
  }
  return null;
}

/** New cookie value: the new token first, then the browser's other still-valid-looking tokens. */
export function addRecognisedBrowserToken(cookieValue: string | null | undefined, token: string): string {
  return [token, ...splitTokens(cookieValue)].slice(0, MAX_TOKENS).join("~");
}

function splitTokens(value: string | null | undefined): string[] {
  if (!value || value.length > 1024) return [];
  return value.split("~").filter((t) => t.length > 0 && t.length <= 128).slice(0, MAX_TOKENS);
}

/** Reads one cookie from a Cookie header without decoding surprises. */
export function readCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}
