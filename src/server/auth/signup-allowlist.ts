import { z } from "zod";

/**
 * Staff-only sign-up allowlist (Phase 6a, owner decision 2 Nov 2026).
 *
 * Membership (Phase 4d) is not authorised, so for now only church staff need accounts.
 * `NLTAG_SIGNUP_ALLOWLIST` is a comma-separated list of email addresses that may create an
 * account. Every other address gets the same "check your email" response as a successful
 * sign-up, no account is created and no email is sent (no account discovery).
 *
 * Fail-closed rules:
 *   - production, variable unset or blank          → nobody can sign up
 *   - any entry that is not a valid email address  → nobody can sign up (configuration error)
 *   - outside production, variable unset or blank  → sign-up open (local development and tests)
 *
 * Sign-in, verification and password reset for existing accounts are not affected.
 * Read at request time from the process environment; never logs or returns addresses.
 */

export type SignupPolicy =
  | { kind: "open" }
  | { kind: "allowlist"; emails: ReadonlySet<string> }
  | { kind: "closed"; reason: "not-set" | "invalid" };

const emailSchema = z.email();

export const normaliseEmail = (email: string) => email.trim().toLowerCase();

export function signupPolicy(env: NodeJS.ProcessEnv = process.env): SignupPolicy {
  const raw = env.NLTAG_SIGNUP_ALLOWLIST;
  const entries = (raw ?? "")
    .split(",")
    .map(normaliseEmail)
    .filter((e) => e !== "");
  if (entries.length === 0) return env.NODE_ENV === "production" ? { kind: "closed", reason: "not-set" } : { kind: "open" };
  if (!entries.every((e) => emailSchema.safeParse(e).success)) return { kind: "closed", reason: "invalid" };
  return { kind: "allowlist", emails: new Set(entries) };
}

export function signupAllowed(email: string, policy: SignupPolicy = signupPolicy()): boolean {
  if (policy.kind === "open") return true;
  if (policy.kind === "closed") return false;
  return policy.emails.has(normaliseEmail(email));
}

let warned = false;
/** Logs a configuration problem once, by variable name only. */
export function warnIfMisconfigured(policy: SignupPolicy) {
  if (warned || policy.kind !== "closed" || policy.reason !== "invalid") return;
  warned = true;
  console.warn("NLTAG_SIGNUP_ALLOWLIST contains an entry that is not an email address; all sign-ups are refused until it is fixed.");
}
