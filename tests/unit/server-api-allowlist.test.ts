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
  requestPasswordReset: [
    // Mailbox-first provisioning (D1), after the reply, listed addresses only.
    "src/server/auth/request-account.ts",
    // Forgot-password job (owner approval 5 Nov 2026, PR #24). Rationale: through Better Auth's HTTP
    // handler, its router printed non-API errors raw (a failed query's parameters carry the address);
    // the server API throws to the gate, which logs through the redacting logger. Conditions, pinned
    // by "the gate's reset call" below and by tests/integration/r4-reset-request.test.ts: one call
    // site, inside runResetJob(), reached only from resetRequest() after every gate check (body,
    // origin, redirect, shutdown, queue bound, per-address window) and after the reply is decided; it
    // is not a route, and reset requests never reach the HTTP handler.
    "src/server/security/auth-abuse-gate.ts",
  ],
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

  it("the gate's reset call: one call site, in runResetJob, started only from resetRequest after the reply is decided", () => {
    const gate = files.find((f) => f.path === "src/server/security/auth-abuse-gate.ts")!.src;
    // Exactly one server-API call in the gate, and it is requestPasswordReset.
    expect([...gate.matchAll(/\.api\s*\.\s*([A-Za-z0-9_$]+)\s*\(/g)].map((m) => m[1])).toEqual(["requestPasswordReset"]);
    // It lives in runResetJob ...
    const job = gate.match(/async function runResetJob\([^)]*\)[^{]*\{([\s\S]*?)\n\}/);
    expect(job?.[1]).toMatch(/getAuth\(\)\s*\.api\s*\.\s*requestPasswordReset\(\{ body \}\)/);
    // ... which is referenced exactly twice: its definition, and one start inside resetRequest, in the
    // continuation of the decided-reply promise (never directly, never from another function).
    expect([...gate.matchAll(/runResetJob\b/g)]).toHaveLength(2);
    const reset = gate.match(/async function resetRequest\([^)]*\)[^{]*\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(reset).toMatch(/decided\.then\(\(\) => runResetJob\(jobBody\)\)/);
    // Every gate check comes before the job is created.
    const at = (re: RegExp) => reset.search(re);
    const created = at(/decided\.then/);
    for (const check of [/badRequest\(\)/, /sameOrigin\(req\)/, /localTarget\(/, /isDraining\(\)/, /RESET_REQUEST_MAX_PENDING/, /reserveWindow\(/, /slot\.allowed/]) {
      expect(at(check), String(check)).toBeGreaterThanOrEqual(0);
      expect(at(check), String(check)).toBeLessThan(created);
    }
    // The reset policy no longer forwards to Better Auth's HTTP handler.
    expect(reset).not.toMatch(/\bnext\(/);
    expect(gate).toMatch(/case "resetRequest":\s*return resetRequest\(req\);/);
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
