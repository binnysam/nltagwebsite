import { accountsEnabled } from "../accounts-gate";
import { normaliseEmail, signupPolicy } from "../auth/signup-allowlist";

/**
 * One-time first Church Admin bootstrap during the Hostinger build (Phase 6a).
 *
 * The deployment has no SSH step, so — like the approved CMS migration — the build runs this
 * only when the owner sets NLTAG_BOOTSTRAP_ADMIN_EMAIL for one build and removes it straight
 * after (docs/operations/admin-activation.md). It fails closed: every precondition below must
 * hold, otherwise nothing is granted. bootstrapFirstAdmin() then still requires an existing,
 * verified account, refuses once any Church Admin exists (row lock against races) and writes the
 * required `role.bootstrap` audit row.
 *
 * Output is one line: "granted" or "not done: <reason>". The address and user id are never
 * printed (build logs are visible in hPanel).
 */

export type BootstrapDecision = { run: false; message: string } | { run: true; email: string };

const NOT_REQUESTED = "No admin bootstrap requested (NLTAG_BOOTSTRAP_ADMIN_EMAIL not set).";

export function decideBootstrap(env: NodeJS.ProcessEnv): BootstrapDecision {
  const raw = env.NLTAG_BOOTSTRAP_ADMIN_EMAIL;
  if (raw === undefined || raw.trim() === "") return { run: false, message: NOT_REQUESTED };
  const email = normaliseEmail(raw);
  const notDone = (reason: string): BootstrapDecision => ({ run: false, message: `Admin bootstrap not done: ${reason}` });

  if (email.includes(",") || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return notDone("NLTAG_BOOTSTRAP_ADMIN_EMAIL must be one email address.");
  if (!accountsEnabled(env)) return notDone("accounts are not enabled (NLTAG_ACCOUNTS_ENABLED, SMTP and AUTH_RATE_LIMIT=on are all required).");
  const policy = signupPolicy(env);
  // The first admin must be a listed staff address. An open policy only exists outside production.
  if (policy.kind === "closed") return notDone("NLTAG_SIGNUP_ALLOWLIST is not set or not valid.");
  if (policy.kind === "allowlist" && !policy.emails.has(email)) return notDone("the address is not on NLTAG_SIGNUP_ALLOWLIST.");
  return { run: true, email };
}

export interface BootstrapDeps {
  bootstrap: (email: string) => Promise<string>;
  /** Maps a known refusal to a reason that never contains the address. */
  reasonOf: (error: unknown) => string;
}

/** Returns the single line to print. Never throws; never includes the address or user id. */
export async function runEnvBootstrap(env: NodeJS.ProcessEnv, deps: BootstrapDeps): Promise<{ granted: boolean; message: string }> {
  const decision = decideBootstrap(env);
  if (!decision.run) return { granted: false, message: decision.message };
  try {
    await deps.bootstrap(decision.email);
    return { granted: true, message: "Admin bootstrap: Church Admin role granted. Remove NLTAG_BOOTSTRAP_ADMIN_EMAIL now and redeploy." };
  } catch (error) {
    return { granted: false, message: `Admin bootstrap not done: ${deps.reasonOf(error)}` };
  }
}
