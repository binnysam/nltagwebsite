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

/**
 * L1 (post-deployment review, 4 Nov 2026): the scans above only see `.api.<name>(`. These add the
 * other ways to reach Better Auth without the /api/auth gate: its HTTP handler called directly,
 * the auth instance or getAuth stored, passed or renamed (aliasing), optional or bracket access,
 * endpoint functions imported from "better-auth/api", and a second Better Auth instance.
 */
const GATED_ROUTE = "src/app/api/auth/[...all]/route.ts";

/** Code with comments AND string/template contents removed, for access-pattern scans (keeps the quotes). */
const codeOnly = (text: string) => code(text).replace(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g, (m) => m[0]! + m[0]!);

/** Every way a file can reach the Better Auth instance other than the approved forms. */
function aliasViolations(path: string, text: string): string[] {
  const src = codeOnly(text);
  const out: string[] = [];
  // 1. getAuth() must be followed directly by .api.<name>(, .$context or (gated route only) .handler(.
  for (const m of src.matchAll(/\bgetAuth\s*\(\s*\)/g)) {
    if (path === AUTH && /function\s+$/.test(src.slice(Math.max(0, m.index! - 20), m.index!))) continue; // the definition
    const rest = src.slice(m.index! + m[0].length);
    const ok = /^\s*\.\s*api\s*\.\s*[A-Za-z0-9_$]+\s*\(/.test(rest) || /^\s*\.\s*\$context\b/.test(rest) || (path === GATED_ROUTE && /^\s*\.\s*handler\s*\(/.test(rest));
    if (!ok) out.push(`${path}: getAuth() used as a value (${rest.slice(0, 24).replace(/\s+/g, " ").trim() || "end"})`);
  }
  // 2. getAuth itself never stored, passed or re-exported (only called, imported by name, or defined).
  for (const m of src.matchAll(/\bgetAuth\b(?!\s*\()/g)) {
    const before = src.slice(Math.max(0, m.index! - 40), m.index!);
    const after = src.slice(m.index! + m[0].length, m.index! + m[0].length + 40);
    const namedImport = /import\s*(type\s*)?\{[^}]*$/.test(before) && /^[^}]*\}\s*from/.test(after) && !/^\s*as\b/.test(after);
    const definition = path === AUTH && /function\s+$/.test(before);
    if (!namedImport && !definition) out.push(`${path}: getAuth referenced without a call`);
  }
  // 3. Renamed or namespace imports of the auth module would hide getAuth from the scans above.
  if (/import\s*\{[^}]*\bgetAuth\s+as\b/.test(src)) out.push(`${path}: getAuth imported under another name`);
  if (/import\s*\*\s*as\s+\w+\s*from\s*["'][^"']*auth\/auth["']/.test(text)) out.push(`${path}: namespace import of the auth module`);
  if (/require\s*\(\s*["'][^"']*auth\/auth["']\s*\)/.test(text) || /import\s*\(\s*["'][^"']*auth\/auth["']\s*\)/.test(text)) out.push(`${path}: dynamic import of the auth module`);
  // 4. Optional or bracket access, and api methods used other than as a direct call.
  if (/\.\s*api\s*\?\./.test(src) || /\?\.\s*api\b/.test(src)) out.push(`${path}: optional-chained api`);
  for (const m of src.matchAll(/\.\s*api\s*\.\s*([A-Za-z0-9_$]+)(?![A-Za-z0-9_$]|\s*\()/g)) out.push(`${path}: api.${m[1]} used without a direct call`);
  if (/\[\s*["'`](api|handler|\$context)["'`]\s*\]/.test(code(text))) out.push(`${path}: bracket access to api/handler/$context`);
  for (const m of src.matchAll(/\{([^{}]*)\}\s*=\s*(await\s+)?([\w$.()]+)/g)) {
    if (/\b(api|handler|\$context)\b/.test(m[1]!) && /getAuth|auth/i.test(m[3]!)) out.push(`${path}: destructured ${m[1]!.trim()} from ${m[3]}`);
  }
  if (/Reflect\s*\.\s*(get|apply)\s*\(\s*getAuth/.test(src)) out.push(`${path}: Reflect access`);
  // 5. The HTTP handler: only the gated route may call it.
  if (path !== GATED_ROUTE && /\.\s*handler\s*\(/.test(src) && /\bgetAuth\b/.test(src)) out.push(`${path}: Better Auth handler called outside the gated route`);
  return out;
}

/** Names that may be imported from "better-auth/api": helpers only, never an endpoint. */
const BETTER_AUTH_API_IMPORTS = new Set(["APIError", "createAuthMiddleware", "getSessionFromCtx"]);

describe("L1: direct handler access and aliasing", () => {
  it("no file reaches Better Auth through an alias, a stored instance or a renamed import", () => {
    const violations = files.flatMap(({ path }) => aliasViolations(path, readFileSync(path, "utf8")));
    expect(violations).toEqual([]);
  });

  it("the HTTP handler is called once, in the /api/auth route, and only through gateAuthRequest", () => {
    const callers = files.filter((f) => /\.\s*handler\s*\(/.test(codeOnly(f.src)) && /getAuth/.test(f.src)).map((f) => f.path);
    expect(callers).toEqual([GATED_ROUTE]);
    const route = codeOnly(files.find((f) => f.path === GATED_ROUTE)!.src);
    expect([...route.matchAll(/\.\s*handler\s*\(/g)]).toHaveLength(1);
    expect(route).toMatch(/gateAuthRequest\(\s*req\s*,\s*\(\s*r\s*\)\s*=>\s*getAuth\(\)\.handler\(\s*withTrustedClientIpRequest\(\s*r\s*\)\s*\)\s*\)/);
    expect(route).toMatch(/accountsEnabled\(\)\s*\?\s*gateAuthRequest\(/);
  });

  it("toNextJsHandler only in the gated route, and betterAuth() only in auth.ts", () => {
    const next = files.filter((f) => /\btoNextJsHandler\b/.test(f.src)).map((f) => f.path);
    expect(next).toEqual([GATED_ROUTE]);
    const instances = files.filter((f) => /\bbetterAuth\s*\(/.test(f.src)).map((f) => f.path);
    expect(instances).toEqual([AUTH]);
  });

  it('only helpers are imported from "better-auth/api" (no endpoint functions)', () => {
    const violations: string[] = [];
    for (const { path, src } of files) {
      for (const m of src.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["']better-auth\/api["']/g)) {
        for (const name of m[1]!.split(",").map((n) => n.trim().split(/\s+as\s+/)[0]!.replace(/^type\s+/, "")).filter(Boolean)) {
          if (!BETTER_AUTH_API_IMPORTS.has(name)) violations.push(`${path}: ${name}`);
        }
      }
      if (/import\s*\*\s*as\s+\w+\s*from\s*["']better-auth\/api["']/.test(src)) violations.push(`${path}: namespace import of better-auth/api`);
      if (/(require|import)\s*\(\s*["']better-auth\/api["']\s*\)/.test(src)) violations.push(`${path}: dynamic import of better-auth/api`);
    }
    expect(violations).toEqual([]);
  });

  it("self-check: each bypass pattern is caught", () => {
    const cases: Record<string, string> = {
      "handler outside the route": `import { getAuth } from "@/server/auth/auth";\nexport const POST = (r: Request) => getAuth().handler(r);`,
      "stored instance": `import { getAuth } from "./auth";\nconst a = getAuth();\nawait a.api.signInEmail({ body });`,
      "awaited stored instance": `import { getAuth } from "./auth";\nconst a = await getAuth();\na.handler(req);`,
      "instance passed to a helper": `import { getAuth } from "./auth";\nrun(getAuth());`,
      "getAuth stored": `import { getAuth } from "./auth";\nconst g = getAuth;\ng().api.signInEmail({});`,
      "getAuth renamed": `import { getAuth as ga } from "./auth";\nga().api.signInEmail({});`,
      "namespace import": `import * as A from "@/server/auth/auth";\nA.getAuth().api.getSession({});`,
      "dynamic import": `const m = await import("@/server/auth/auth");`,
      "optional api": `import { getAuth } from "./auth";\nawait getAuth().api?.signInEmail({});`,
      "bracket handler": `import { getAuth } from "./auth";\nawait getAuth()["handler"](req);`,
      "bound method": `import { getAuth } from "./auth";\nconst f = getAuth().api.signInEmail.bind(null);`,
      "destructured handler": `import { getAuth } from "./auth";\nconst { handler } = getAuth();`,
      "Reflect": `import { getAuth } from "./auth";\nReflect.get(getAuth(), "api");`,
    };
    for (const [name, src] of Object.entries(cases)) {
      expect(aliasViolations("src/server/x.ts", src).length, name).toBeGreaterThan(0);
    }
    // The approved forms pass.
    const fine = `import { getAuth } from "@/server/auth/auth";\nconst s = await getAuth().api.getSession({ headers });\nconst ctx = await getAuth().$context;\nconst msg = "getAuth().api";`;
    expect(aliasViolations("src/server/y.ts", fine)).toEqual([]);
    expect(aliasViolations(GATED_ROUTE, `import { getAuth } from "@/server/auth/auth";\ngateAuthRequest(req, (r) => getAuth().handler(r));`)).toEqual([]);
  });
});
