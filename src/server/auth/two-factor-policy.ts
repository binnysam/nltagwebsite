import type { StaffRole } from "../db/schema/access";

/**
 * Two-factor policy (Phase 6b). Pure data and functions, no I/O, so it is unit-tested directly
 * and shared by the Better Auth configuration (auth.ts), the permission matrix and the pages.
 *
 * Owner requirement (2 Nov 2026): every Church Admin signs in with an authenticator app (TOTP).
 * Until the account has a verified authenticator, a Church Admin role grants nothing
 * (permissions.ts), the admin sends the person to set it up, and the first-admin bootstrap
 * refuses to run. Content Editors may turn it on but are not required to (owner decision).
 */
export const TWO_FACTOR_REQUIRED_ROLES: readonly StaffRole[] = ["CHURCH_ADMIN"];

export function roleRequiresTwoFactor(role: StaffRole): boolean {
  return TWO_FACTOR_REQUIRED_ROLES.includes(role);
}

/** True when the person holds a role that needs two-factor and has not enrolled yet. */
export function needsTwoFactorEnrollment(roles: readonly StaffRole[], twoFactorEnabled: boolean): boolean {
  return !twoFactorEnabled && roles.some(roleRequiresTwoFactor);
}

/**
 * Better Auth endpoints that may create a session for someone who already has two-factor on.
 * Every one of them either proves the second factor (verify-*), runs the plugin's challenge
 * (sign-in/email: the plugin deletes the password-only session and asks for a code), or needs an
 * existing session that was itself created this way (enable, disable, change-password).
 * Anything else — the automatic sign-in after an email link, Google sign-in, or any endpoint a
 * future upgrade adds — is refused for these accounts (auth.ts session.create.before).
 */
export const SESSION_PATHS_WITH_SECOND_FACTOR: ReadonlySet<string> = new Set([
  "/sign-in/email",
  "/two-factor/verify-totp",
  "/two-factor/verify-backup-code",
  "/two-factor/enable",
  "/two-factor/disable",
  "/change-password",
]);

/** Endpoints that need the current password AND a current second factor (`code` in the body). */
export const PATHS_NEEDING_SECOND_FACTOR: ReadonlySet<string> = new Set(["/two-factor/disable", "/two-factor/generate-backup-codes"]);

/**
 * Plugin endpoints that are switched off entirely:
 * - get-totp-uri would hand out the authenticator secret again for just a password, letting a
 *   password thief copy the authenticator. Enrollment shows the secret once; re-enrollment means
 *   turning two-factor off (password + code) and on again.
 * - send-otp / verify-otp: email codes are not used (authenticator apps only).
 */
export const BLOCKED_TWO_FACTOR_PATHS: ReadonlySet<string> = new Set([
  "/two-factor/get-totp-uri",
  "/two-factor/send-otp",
  "/two-factor/verify-otp",
]);

/** Six digits from an authenticator app (spaces allowed while typing). */
export const TOTP_CODE = /^\d{6}$/;
/** Recovery code as Better Auth generates it: 5 + 5 letters/digits joined by a hyphen. */
export const RECOVERY_CODE = /^[A-Za-z0-9]{5}-[A-Za-z0-9]{5}$/;

export type SecondFactorKind = "totp" | "recovery";

/** Normalises what a person typed and says which kind of code it is, or null if neither. */
export function parseSecondFactor(raw: unknown): { kind: SecondFactorKind; code: string } | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  const digits = trimmed.replace(/[\s-]/g, "");
  if (TOTP_CODE.test(digits)) return { kind: "totp", code: digits };
  // Recovery codes are case-sensitive; accept them without the hyphen too.
  const compact = trimmed.replace(/\s/g, "");
  const withHyphen = /^[A-Za-z0-9]{10}$/.test(compact) ? `${compact.slice(0, 5)}-${compact.slice(5)}` : compact;
  if (RECOVERY_CODE.test(withHyphen)) return { kind: "recovery", code: withHyphen };
  return null;
}

/** Limits outside Better Auth's HTTP limiter (server actions call the API directly). */
export const TWO_FACTOR_LIMITS = {
  /** Enable, regenerate, disable or confirm-enrollment attempts per account. */
  manage: { window: 15 * 60, max: 5 },
} as const;

/** Wrong codes in a row before the plugin locks the account's second factor, and for how long. */
export const TWO_FACTOR_LOCKOUT = { maxFailedAttempts: 5, durationSeconds: 15 * 60 } as const;

/** How long a person has to type the code after a correct password (plugin challenge cookie). */
export const TWO_FACTOR_CHALLENGE_SECONDS = 5 * 60;

export const TOTP_ISSUER = "NLTAG";
