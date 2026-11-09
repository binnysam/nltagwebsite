import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { serverEnv } from "../env";
import { reserveWindow, type RateRule } from "../services/rate-limit";
export { MAX_LINKS, countLinks } from "./protection-pure";

/**
 * Spam and abuse protection for the public forms, without client IPs (they cannot be trusted
 * behind Hostinger's CDN; R4) and without third-party services (roadmap §5.4):
 *
 *  1. Honeypot field, hidden from people and screen readers; bots fill it.
 *  2. Signed form token (HMAC of the form name and the time the page was served): submissions
 *     faster than MIN_FILL_MS or older than MAX_AGE_MS are refused.
 *  3. Duplicate refusal: the same normalised text within 24 h is accepted once (contentHash).
 *  4. At most MAX_LINKS links in the text; length caps in validation.ts.
 *  5. Site-wide ceilings per form (FORM_CEILINGS) in the existing rate_limit_bucket table. Over the
 *     ceiling the form says "try again later"; nothing more is stored or mailed.
 * Bots that fail 1 or 2 get the normal "received" answer and nothing is stored (no feedback loop).
 */
export const FORMS = ["prayer", "contact", "testimony"] as const;
export type FormName = (typeof FORMS)[number];

export const HONEYPOT_FIELD = "website";
export const TOKEN_FIELD = "formToken";
export const MIN_FILL_MS = 3_000;
export const MAX_AGE_MS = 2 * 3600_000;

export const DUPLICATE_WINDOW_MS = 24 * 3600_000;

export const FORM_CEILINGS: Record<FormName, { burst: RateRule; day: RateRule }> = {
  prayer: { burst: { window: 600, max: 20 }, day: { window: 86_400, max: 200 } },
  contact: { burst: { window: 600, max: 20 }, day: { window: 86_400, max: 200 } },
  testimony: { burst: { window: 600, max: 10 }, day: { window: 86_400, max: 60 } },
};

const mac = (purpose: string, value: string) => createHmac("sha256", serverEnv().BETTER_AUTH_SECRET).update(`${purpose}:${value}`).digest("base64url");

export function issueFormToken(form: FormName, now = Date.now()): string {
  return `${now}.${mac(`form-token:${form}`, String(now))}`;
}

export type TokenCheck = "ok" | "invalid" | "too-fast" | "expired";

export function checkFormToken(form: FormName, token: unknown, now = Date.now()): TokenCheck {
  if (typeof token !== "string") return "invalid";
  const [issued, sig] = token.split(".");
  if (!issued || !sig || !/^\d{10,16}$/.test(issued)) return "invalid";
  const expected = Buffer.from(mac(`form-token:${form}`, issued));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return "invalid";
  const age = now - Number(issued);
  if (age < MIN_FILL_MS) return "too-fast";
  if (age > MAX_AGE_MS) return "expired";
  return "ok";
}



/** Keyed, non-reversible fingerprint of the normalised text, for duplicate refusal only. */
export function contentHash(form: FormName, parts: readonly string[]): string {
  const normalised = parts.map((p) => p.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim()).join("\u0000");
  return createHmac("sha256", serverEnv().BETTER_AUTH_SECRET).update(`form-dup:${form}:${normalised}`).digest("hex");
}

/** Reserves one submission under both ceilings; false when either is full. */
export async function withinCeilings(form: FormName, now = Date.now()): Promise<boolean> {
  const c = FORM_CEILINGS[form];
  const burst = await reserveWindow(`form:${form}:burst`, c.burst, now);
  if (!burst.allowed) return false;
  const day = await reserveWindow(`form:${form}:day`, c.day, now);
  return day.allowed;
}
