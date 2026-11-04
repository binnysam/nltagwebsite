import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * R4 v6.1 G2 — server-API allowlist (regression guard). Better Auth's server API (`getAuth().api.*`)
 * and its internal context (`$context`, `internalAdapter`) bypass the /api/auth gate entirely, so a
 * new server action calling them would be an unprotected route. This test scans every file under
 * src/ and fails on any call outside the approved list. Sign-in, sign-up, password reset, change
 * and verify-password stay HTTP-only, through the gate. (scripts/db/seed.ts is outside src/.)
 * To add a call site: get it approved, then add it here with the reason.
 */

const TWO_FACTOR_ACTIONS = "src/app/[locale]/(account)/account/two-factor/actions.ts";
const AUTH = "src/server/auth/auth.ts";

/** api method → files allowed to call it. */
const API_ALLOWLIST: Record<string, readonly string[]> = {
  // Reads; where they are already used.
  getSession: ["src/server/auth/session.ts"],
  listSessions: ["src/app/[locale]/(account)/account/page.tsx"],
  // Count-only recovery-code helper (§3.8): the decrypted codes never leave it.
  viewBackupCodes: ["src/server/auth/recovery-codes.ts"],
  // Two-factor management (D6): the account page's server actions, and auth.ts's own check of the
  // current second factor inside the before hook.
  enableTwoFactor: [TWO_FACTOR_ACTIONS],
  verifyTOTP: [TWO_FACTOR_ACTIONS, AUTH],
  verifyBackupCode: [AUTH],
  generateBackupCodes: [TWO_FACTOR_ACTIONS],
  disableTwoFactor: [TWO_FACTOR_ACTIONS],
  // Mailbox-first provisioning (D1), after the reply, listed addresses only.
  requestPasswordReset: ["src/server/auth/request-account.ts"],
};

/** Files allowed to touch `$context`, and what they may use from it. */
const CONTEXT_ALLOWLIST: Record<string, { internalAdapter: readonly string[] }> = {
  // internalAdapter.createUser only (mailbox-first: a user row with no credential).
  "src/server/auth/request-account.ts": { internalAdapter: ["createUser"] },
  // v6.1 G1: cookie NAMES only (createAuthCookie("two_factor"), authCookies) — no adapter access.
  "src/server/security/auth-abuse-gate.ts": { internalAdapter: [] },
};

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(name)) out.push(relative(process.cwd(), path).split("\\").join("/"));
  }
  return out;
}

/** Source without comments, so a mention in documentation is not a call. */
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const files = sourceFiles("src").map((path) => ({ path, src: code(readFileSync(path, "utf8")) }));

describe("v6.1 G2: Better Auth server API allowlist", () => {
  it("scans the whole of src/", () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files.some((f) => f.path === "src/server/auth/request-account.ts")).toBe(true);
  });

  it("every .api.<name>( call is on the allowlist, in an allowed file", () => {
    const violations: string[] = [];
    for (const { path, src } of files) {
      for (const m of src.matchAll(/\.api\s*\.\s*([A-Za-z0-9_$]+)\s*\(/g)) {
        const allowed = API_ALLOWLIST[m[1]!];
        if (!allowed || !allowed.includes(path)) violations.push(`${path}: api.${m[1]}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("no indirect access to the API object (bracket access, destructuring or aliasing)", () => {
    const violations: string[] = [];
    for (const { path, src } of files) {
      if (/\.api\s*\[/.test(src)) violations.push(`${path}: .api[...]`);
      if (/\{\s*[^}]*\bapi\b[^}]*\}\s*=\s*(await\s+)?getAuth\(\)/.test(src)) violations.push(`${path}: destructured api`);
      if (/=\s*(await\s+)?getAuth\(\)\s*\.api\s*[;,)]/.test(src)) violations.push(`${path}: aliased api`);
    }
    expect(violations).toEqual([]);
  });

  it("$context and internalAdapter only where allowed, and only the allowed adapter calls", () => {
    const violations: string[] = [];
    for (const { path, src } of files) {
      const usesContext = /\$context/.test(src);
      const adapterCalls = [...src.matchAll(/internalAdapter\s*\.\s*([A-Za-z0-9_$]+)/g)].map((m) => m[1]!);
      const bareAdapter = /internalAdapter(?!\s*\.)/.test(src);
      const rule = CONTEXT_ALLOWLIST[path];
      if (!rule) {
        if (usesContext) violations.push(`${path}: $context`);
        if (adapterCalls.length || bareAdapter) violations.push(`${path}: internalAdapter`);
        continue;
      }
      if (bareAdapter) violations.push(`${path}: internalAdapter used without a call`);
      for (const c of adapterCalls) if (!rule.internalAdapter.includes(c)) violations.push(`${path}: internalAdapter.${c}`);
    }
    expect(violations).toEqual([]);
  });

  it("the gate takes cookie names from $context and nothing else", () => {
    const gate = files.find((f) => f.path === "src/server/security/auth-abuse-gate.ts")!.src;
    const uses = [...gate.matchAll(/\bctx\s*\.\s*([A-Za-z0-9_$]+)/g)].map((m) => m[1]!);
    expect(new Set(uses)).toEqual(new Set(["createAuthCookie", "authCookies"]));
  });

  it("the guard itself fails on an unlisted call (self-check)", () => {
    const fake = code("export async function x() { await getAuth().api.signInEmail({ body }); }");
    const hits = [...fake.matchAll(/\.api\s*\.\s*([A-Za-z0-9_$]+)\s*\(/g)].map((m) => m[1]);
    expect(hits).toEqual(["signInEmail"]);
    expect(API_ALLOWLIST.signInEmail).toBeUndefined();
    for (const forbidden of ["signInEmail", "signUpEmail", "resetPassword", "changePassword", "verifyPassword", "verifyEmail", "sendVerificationEmail"]) {
      expect(API_ALLOWLIST[forbidden], forbidden).toBeUndefined();
    }
  });
});
