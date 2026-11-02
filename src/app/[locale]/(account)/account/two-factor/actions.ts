"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import type { UiStringKey } from "@/content/ui-strings";
import { accountsEnabled } from "@/server/accounts-gate";
import { getAuth } from "@/server/auth/auth";
import { getCurrentUser } from "@/server/auth/session";
import { parseSecondFactor, TOTP_CODE, TWO_FACTOR_LIMITS } from "@/server/auth/two-factor-policy";
import { log } from "@/server/security/log";
import { consume } from "@/server/services/rate-limit";

/**
 * Two-factor management for the signed-in person (Phase 6b). Each action:
 *   1. refuses while accounts are off and when nobody is signed in;
 *   2. counts the attempt against a per-account limit in MariaDB (Better Auth's own limiter only
 *      sees HTTP requests, and these run as direct API calls);
 *   3. calls Better Auth's two-factor plugin on the caller's own session — never another user's;
 *   4. returns a fixed string key, never a server message, and never logs codes or secrets.
 * Turning it off and replacing recovery codes also pass the auth.ts before hook, which demands a
 * current authenticator or recovery code on top of the password.
 */

export type TwoFactorResult =
  | { ok: true; uri?: string; setupKey?: string; codes?: string[] }
  | { ok: false; error: UiStringKey };

const fail = (error: UiStringKey): TwoFactorResult => ({ ok: false, error });

async function caller() {
  if (!accountsEnabled()) return null;
  const h = await headers();
  const me = await getCurrentUser(h);
  return me ? { me, h } : null;
}

async function withinLimit(userId: string): Promise<boolean> {
  return (await consume(`2fa-manage:${userId}`, TWO_FACTOR_LIMITS.manage)).allowed;
}

function errorFor(error: unknown): UiStringKey {
  if (error instanceof APIError) {
    const code = (error.body as { code?: string } | undefined)?.code;
    if (error.statusCode === 429) return "auth.error.rateLimited";
    if (code === "INVALID_PASSWORD") return "twoFactor.error.password";
    if (code === "SESSION_NOT_FRESH") return "twoFactor.error.fresh";
    if (code === "INVALID_SECOND_FACTOR" || code === "INVALID_CODE" || code === "INVALID_BACKUP_CODE") return "twoFactor.error.code";
    if (error.statusCode === 401) return "twoFactor.error.fresh";
    return "auth.error.generic";
  }
  log("error", "two_factor.action_failed", { error });
  return "auth.error.generic";
}

/** The base32 secret inside otpauth://… so people who cannot scan can type it into the app. */
function setupKeyOf(uri: string): string {
  const secret = new URL(uri).searchParams.get("secret") ?? "";
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

/** Step 1 → 2: password confirmed; returns the authenticator URI and the 10 recovery codes once. */
export async function startEnrollment(password: string): Promise<TwoFactorResult> {
  const c = await caller();
  if (!c) return fail("twoFactor.error.fresh");
  if (c.me.principal.twoFactorEnabled) return fail("auth.error.generic");
  if (typeof password !== "string" || password.length === 0 || password.length > 128) return fail("twoFactor.error.password");
  if (!(await withinLimit(c.me.userId))) return fail("auth.error.rateLimited");
  try {
    const r = await getAuth().api.enableTwoFactor({ headers: c.h, body: { password, method: "totp" } });
    if (r.method !== "totp" || !r.totpURI || !r.backupCodes) return fail("auth.error.generic");
    return { ok: true, uri: r.totpURI, setupKey: setupKeyOf(r.totpURI), codes: r.backupCodes };
  } catch (error) {
    return fail(errorFor(error));
  }
}

/** Step 3: the first six-digit code proves the app works; only then is two-factor on. */
export async function confirmEnrollment(code: string): Promise<TwoFactorResult> {
  const c = await caller();
  if (!c) return fail("twoFactor.error.fresh");
  const digits = typeof code === "string" ? code.replace(/\s/g, "") : "";
  if (!TOTP_CODE.test(digits)) return fail("twoFactor.error.code");
  if (!(await withinLimit(c.me.userId))) return fail("auth.error.rateLimited");
  try {
    // On success the plugin turns two-factor on and issues a new session cookie for this browser
    // (nextCookies); auth.ts ends every other session at the same moment.
    await getAuth().api.verifyTOTP({ headers: c.h, body: { code: digits } });
    return { ok: true };
  } catch (error) {
    return fail(errorFor(error));
  }
}

/** New set of 10 recovery codes. Needs the password and a current code (auth.ts before hook). */
export async function regenerateRecoveryCodes(password: string, code: string): Promise<TwoFactorResult> {
  const c = await caller();
  if (!c) return fail("twoFactor.error.fresh");
  if (!c.me.principal.twoFactorEnabled) return fail("auth.error.generic");
  if (!parseSecondFactor(code)) return fail("twoFactor.error.code");
  if (typeof password !== "string" || password.length === 0 || password.length > 128) return fail("twoFactor.error.password");
  try {
    const body = { password, code } as { password: string };
    const r = await getAuth().api.generateBackupCodes({ headers: c.h, body });
    return { ok: true, codes: r.backupCodes };
  } catch (error) {
    return fail(errorFor(error));
  }
}

/** Turns two-factor off. Needs the password and a current code (auth.ts before hook). */
export async function disableTwoFactor(password: string, code: string): Promise<TwoFactorResult> {
  const c = await caller();
  if (!c) return fail("twoFactor.error.fresh");
  if (!c.me.principal.twoFactorEnabled) return fail("auth.error.generic");
  if (!parseSecondFactor(code)) return fail("twoFactor.error.code");
  if (typeof password !== "string" || password.length === 0 || password.length > 128) return fail("twoFactor.error.password");
  try {
    const body = { password, code } as { password: string };
    await getAuth().api.disableTwoFactor({ headers: c.h, body });
    return { ok: true };
  } catch (error) {
    return fail(errorFor(error));
  }
}
