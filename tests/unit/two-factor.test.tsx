import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { uiStrings } from "@/content/ui-strings";
import {
  BLOCKED_TWO_FACTOR_PATHS,
  needsTwoFactorEnrollment,
  parseSecondFactor,
  PATHS_NEEDING_SECOND_FACTOR,
  SESSION_PATHS_WITH_SECOND_FACTOR,
  TWO_FACTOR_LIMITS,
  TWO_FACTOR_LOCKOUT,
  TWO_FACTOR_REQUIRED_ROLES,
} from "@/server/auth/two-factor-policy";
import { can, permissionsFor, type Principal } from "@/server/policy/permissions";
import { AUDIT_ACTIONS } from "@/server/services/audit";
import { AUTH_ROUTES, DENIED_ENDPOINTS } from "@/server/security/auth-routes";
import { challengeError } from "@/app/[locale]/(account)/two-factor/TwoFactorChallenge";
import { QrCode } from "@/app/[locale]/(account)/account/two-factor/QrCode";
import { base32Decode, hotp, totp } from "../support/totp";

/** Phase 6b: two-factor policy, its effect on the permission matrix, config and UI pieces. */

const adminNo2fa: Principal = { kind: "user", userId: "a", emailVerified: true, roles: ["CHURCH_ADMIN"], twoFactorEnabled: false };
const admin2fa: Principal = { ...adminNo2fa, twoFactorEnabled: true };
const editorNo2fa: Principal = { kind: "user", userId: "e", emailVerified: true, roles: ["CONTENT_EDITOR"], twoFactorEnabled: false };
const bothNo2fa: Principal = { ...adminNo2fa, roles: ["CHURCH_ADMIN", "CONTENT_EDITOR"] };

describe("two-factor policy", () => {
  it("is required for Church Admins (owner decision) and the Prayer Team (Nov 2026), not Content Editors", () => {
    expect(TWO_FACTOR_REQUIRED_ROLES).toEqual(["CHURCH_ADMIN", "PRAYER_TEAM"]);
    expect(needsTwoFactorEnrollment(["PRAYER_TEAM"], false)).toBe(true);
    expect(needsTwoFactorEnrollment(["PRAYER_TEAM"], true)).toBe(false);
    expect(needsTwoFactorEnrollment(["CHURCH_ADMIN"], false)).toBe(true);
    expect(needsTwoFactorEnrollment(["CHURCH_ADMIN"], true)).toBe(false);
    expect(needsTwoFactorEnrollment(["CONTENT_EDITOR"], false)).toBe(false);
    expect(needsTwoFactorEnrollment([], false)).toBe(false);
  });

  it("a Church Admin without two-factor has only member permissions", () => {
    expect([...permissionsFor(adminNo2fa)].sort()).toEqual(["account.manage_own", "content.read_published", "membership.own"]);
    for (const p of ["admin.access", "content.publish", "staff.manage", "audit.read", "membership.export"] as const) expect(can(adminNo2fa, p)).toBe(false);
  });

  it("with two-factor the Church Admin has every staff permission", () => {
    for (const p of ["admin.access", "content.publish", "staff.manage", "audit.read", "membership.export"] as const) expect(can(admin2fa, p)).toBe(true);
  });

  it("an editor's access does not depend on two-factor, and holding both roles does not leak admin rights", () => {
    expect(can(editorNo2fa, "content.draft.edit")).toBe(true);
    expect(can(bothNo2fa, "content.draft.edit")).toBe(true);
    expect(can(bothNo2fa, "content.publish")).toBe(false);
    expect(can(bothNo2fa, "staff.manage")).toBe(false);
  });

  it("only the challenge and session-holding endpoints may create a session for an enrolled account", () => {
    expect([...SESSION_PATHS_WITH_SECOND_FACTOR].sort()).toEqual(
      ["/change-password", "/sign-in/email", "/two-factor/disable", "/two-factor/enable", "/two-factor/verify-backup-code", "/two-factor/verify-totp"].sort(),
    );
    for (const p of ["/verify-email", "/sign-in/social", "/callback/google", "/sign-up/email"]) expect(SESSION_PATHS_WITH_SECOND_FACTOR.has(p)).toBe(false);
  });

  it("turning off and new recovery codes need a second factor; secret re-display and email codes are off", () => {
    expect([...PATHS_NEEDING_SECOND_FACTOR].sort()).toEqual(["/two-factor/disable", "/two-factor/generate-backup-codes"]);
    expect(BLOCKED_TWO_FACTOR_PATHS.has("/two-factor/get-totp-uri")).toBe(true);
    expect(BLOCKED_TWO_FACTOR_PATHS.has("/two-factor/send-otp")).toBe(true);
  });

  it("limits and lockout", () => {
    expect(TWO_FACTOR_LIMITS.manage).toEqual({ window: 900, max: 5 });
    expect(TWO_FACTOR_LOCKOUT).toEqual({ maxFailedAttempts: 5, durationSeconds: 900 });
  });

  it.each([
    ["123456", { kind: "totp", code: "123456" }],
    [" 123 456 ", { kind: "totp", code: "123456" }],
    ["AbC12-xY9z0", { kind: "recovery", code: "AbC12-xY9z0" }],
    ["AbC12xY9z0", { kind: "recovery", code: "AbC12-xY9z0" }],
    ["12345", null],
    ["1234567", null],
    ["abcdef", null],
    ["AbC12-xY9z", null],
    ["<script>", null],
    [123456, null],
    [undefined, null],
  ])("parses %j", (input, expected) => {
    expect(parseSecondFactor(input)).toEqual(expected);
  });
});

describe("audit actions", () => {
  it("cover every two-factor event", () => {
    for (const a of [
      "auth.2fa.enroll_start",
      "auth.2fa.enable",
      "auth.2fa.disable",
      "auth.2fa.verify_fail",
      "auth.2fa.recovery_code.use",
      "auth.2fa.recovery_codes.regenerate",
      "auth.2fa.manage_fail",
      "auth.2fa.bypass_blocked",
      "auth.2fa.required",
    ]) {
      expect(AUDIT_ACTIONS).toContain(a);
      expect(a.length).toBeLessThanOrEqual(64);
    }
  });
});

describe("Better Auth configuration (source)", () => {
  const src = readFileSync("src/server/auth/auth.ts", "utf8");
  it("uses the supported two-factor plugin with TOTP, encrypted recovery codes and lockout", () => {
    expect(src).toMatch(/from "better-auth\/plugins\/two-factor"/);
    expect(src).toMatch(/storeBackupCodes: "encrypted"/);
    expect(src).toMatch(/skipVerificationOnEnable: false/);
    expect(src).toMatch(/allowPasswordless: false/);
    expect(src).toMatch(/accountLockout: \{ enabled: true/);
  });
  it("keeps nextCookies as the last plugin", () => {
    const plugins = src.slice(src.indexOf("plugins: ["));
    expect(plugins.indexOf("twoFactor(")).toBeLessThan(plugins.indexOf("nextCookies()"));
  });
  // R4 class D (D3/D4/D6): Better Auth's own limiter is off; every two-factor endpoint is either a
  // gate-limited sign-in-challenge route or closed over HTTP and reachable only through the
  // server actions, which count each attempt against the per-account `2fa-manage` limit.
  it("rate-limits every two-factor endpoint", () => {
    expect(src).toMatch(/rateLimit:\s*\{\s*enabled:\s*false\s*\}/);
    const twoFactorRoutes = AUTH_ROUTES.filter((r) => r.path.startsWith("/two-factor/"));
    expect(twoFactorRoutes.map((r) => r.path).sort()).toEqual(["/two-factor/verify-backup-code", "/two-factor/verify-totp"]);
    for (const r of twoFactorRoutes) {
      expect(r.policy, r.path).toBe("secondFactor");
      expect(r.requires, r.path).toBe("two-factor challenge cookie");
    }
    for (const p of ["/two-factor/enable", "/two-factor/disable", "/two-factor/generate-backup-codes"]) expect(DENIED_ENDPOINTS, p).toHaveProperty([p]);
    const actions = readFileSync("src/app/[locale]/(account)/account/two-factor/actions.ts", "utf8");
    expect(actions).toContain("`2fa-manage:${userId}`");
    for (const fn of ["startEnrollment", "confirmEnrollment"]) {
      const body = actions.slice(actions.indexOf(`export async function ${fn}(`), actions.indexOf("\n}\n", actions.indexOf(`export async function ${fn}(`)));
      expect(body, fn).toContain("withinLimit(");
    }
    // Turning off and new recovery codes are limited in the auth.ts before hook (same key).
    expect(src).toContain("`2fa-manage:${userId}`");
  });
  it("migration 0003 is additive (no DROP or data change)", () => {
    const sqlText = readFileSync("drizzle/0003_two_factor.sql", "utf8").split("\n").filter((l) => !l.startsWith("--")).join("\n");
    expect(sqlText.replace(/ON (DELETE|UPDATE) [a-z ]+/gi, "")).not.toMatch(/\bDROP\b|\bDELETE\b|\bUPDATE\b|\bTRUNCATE\b/i);
    expect(sqlText).toMatch(/CREATE TABLE `two_factor`/);
    expect(sqlText).toMatch(/ADD `two_factor_enabled` boolean DEFAULT false NOT NULL/);
  });
});

describe("sign-in challenge errors", () => {
  it("map to fixed strings, never server text", () => {
    expect(challengeError(401, "INVALID_CODE")).toBe("twoFactor.error.code");
    expect(challengeError(401, "INVALID_BACKUP_CODE")).toBe("twoFactor.error.code");
    expect(challengeError(401, "INVALID_TWO_FACTOR_COOKIE")).toBe("twoFactor.error.expired");
    expect(challengeError(400, "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE")).toBe("twoFactor.error.expired");
    expect(challengeError(429, "ACCOUNT_TEMPORARILY_LOCKED")).toBe("twoFactor.error.locked");
    expect(challengeError(429, undefined)).toBe("twoFactor.error.locked");
    expect(challengeError(500, "WHATEVER")).toBe("auth.error.generic");
  });
});

describe("QR code", () => {
  it("is drawn locally as an accessible SVG with no external URL", () => {
    const uri = "otpauth://totp/NLTAG:a%40nltag.test?secret=ABCDEFGH&issuer=NLTAG&digits=6&period=30";
    const { container } = render(<QrCode value={uri} label="QR code" />);
    const svg = screen.getByRole("img", { name: "QR code" });
    expect(svg.tagName.toLowerCase()).toBe("svg");
    expect(container.innerHTML).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
    expect(container.querySelector("path")!.getAttribute("d")!.length).toBeGreaterThan(100);
  });
});

describe("two-factor strings", () => {
  const keys = Object.keys(uiStrings).filter((k) => k.startsWith("twoFactor.") || k.startsWith("account.twoFactor") || k === "account.back");
  it("exist in Tamil and English and are owner-approved (2 Nov 2026)", () => {
    expect(keys).toHaveLength(45);
    for (const k of keys) {
      const v = uiStrings[k as keyof typeof uiStrings];
      expect(v.en.trim(), k).not.toBe("");
      expect(v.ta.trim(), k).not.toBe("");
      expect(/[஀-௿]/.test(v.ta), `${k} has Tamil script`).toBe(true);
      expect(v.taStatus, k).toBe("confirmed");
    }
  });
});

describe("test TOTP helper matches RFC 6238", () => {
  it("reproduces the RFC test vector (SHA-1, 59 s → 94287082 for 8 digits)", () => {
    const key = new TextEncoder().encode("12345678901234567890");
    expect(hotp(key, 1, 8)).toBe("94287082");
    expect(totp(key, 59_000)).toBe("287082");
    expect([...base32Decode("GEZDGNBVGY3TQOJQ")]).toEqual([...new TextEncoder().encode("1234567890")]);
  });
});
