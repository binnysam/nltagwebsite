import "server-only";

/**
 * Accounts gate (owner decision, 2 Nov 2026).
 *
 * Every account page (sign-in, sign-up, forgot/reset password, verify email, account) and the
 * Better Auth API (`/api/auth/*`) return 404 until the church's SMTP email delivery is
 * configured and a real delivery test has succeeded. Without working email, sign-up shows
 * "check your email" and nothing arrives, so the flow must not be reachable.
 *
 * To enable (server-side only, no code change; owner runbook: docs/operations/admin-activation.md):
 *   1. SMTP_HOST, SMTP_USER, SMTP_PASS and SMTP_FROM set in the Hostinger environment (done, tested).
 *   2. AUTH_RATE_LIMIT=on and NLTAG_SIGNUP_ALLOWLIST=<staff addresses> set explicitly.
 *   3. Set NLTAG_ACCOUNTS_ENABLED=1 and redeploy/restart.
 *
 * In production the flag is ignored unless all four SMTP variables are present AND
 * AUTH_RATE_LIMIT is explicitly "on" (Phase 6a). The rate limiter also defaults to on, but the
 * gate does not rely on a default: anyone opening accounts must have set it on purpose.
 * Read at request time, never baked into the build. Reads variable presence only; never logs or
 * returns values.
 */
export function accountsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NLTAG_ACCOUNTS_ENABLED?.trim() !== "1") return false;
  // Staging: mail is captured (or sandboxed) by design, never delivered, so SMTP is not required;
  // the explicit rate-limit switch still is. Staging's own configuration checks run elsewhere.
  if (env.NLTAG_DEPLOYMENT?.trim() === "staging") return env.AUTH_RATE_LIMIT?.trim() === "on";
  if (env.NODE_ENV !== "production") return true;
  const smtp = [env.SMTP_HOST, env.SMTP_USER, env.SMTP_PASS, env.SMTP_FROM];
  if (!smtp.every((v) => typeof v === "string" && v.trim() !== "")) return false;
  return env.AUTH_RATE_LIMIT?.trim() === "on";
}
