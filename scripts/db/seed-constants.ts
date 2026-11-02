// Fictional, public, test-only values shared by the seed and the tests. No imports, so browser
// tests can read them without loading the app. Never used outside local and CI databases.
export const SEED_PASSWORD = "nltag-dev-only-password";

/**
 * Phase 6b: Church Admins must have two-factor on, so the seeded admin has an authenticator app
 * enrolled with this secret (tests compute codes from it: tests/support/totp.ts) and these
 * recovery codes.
 */
export const SEED_TOTP_SECRET = "nltag-dev-only-totp-secret-0000a";
export const SEED_RECOVERY_CODES = Array.from({ length: 10 }, (_, i) => `DEVRC-${String(i).padStart(5, "0")}`);
