import "server-only";

/**
 * Accounts gate (owner decision, 2 Nov 2026).
 *
 * Every account page (sign-in, sign-up, forgot/reset password, verify email, account) and the
 * Better Auth API (`/api/auth/*`) return 404 until the church's SMTP email delivery is
 * configured and a real delivery test has succeeded. Without working email, sign-up shows
 * "check your email" and nothing arrives, so the flow must not be reachable.
 *
 * To enable later (server-side only, no code change):
 *   1. Set SMTP_HOST, SMTP_USER, SMTP_PASS and SMTP_FROM in the Hostinger environment.
 *   2. Run the end-to-end email delivery test (docs/backend/data-and-auth.md, "Enabling accounts").
 *   3. Set NLTAG_ACCOUNTS_ENABLED=1 and redeploy/restart.
 *
 * In production the flag is ignored unless all four SMTP variables are present, so the pages
 * cannot be switched on by the flag alone. Read at request time, never baked into the build.
 * Reads variable presence only; never logs or returns values.
 */
export function accountsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NLTAG_ACCOUNTS_ENABLED?.trim() !== "1") return false;
  if (env.NODE_ENV !== "production") return true;
  const smtp = [env.SMTP_HOST, env.SMTP_USER, env.SMTP_PASS, env.SMTP_FROM];
  return smtp.every((v) => typeof v === "string" && v.trim() !== "");
}
