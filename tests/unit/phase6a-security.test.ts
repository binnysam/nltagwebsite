// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { signupAllowed, signupPolicy } from "@/server/auth/signup-allowlist";
import { decideBootstrap, runEnvBootstrap } from "@/server/services/env-bootstrap";

const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;
const SMTP = { SMTP_HOST: "smtp.example.test", SMTP_USER: "u", SMTP_PASS: "p", SMTP_FROM: "NLTAG <u@example.test>" };
const OPEN_PROD = { NODE_ENV: "production", NLTAG_ACCOUNTS_ENABLED: "1", AUTH_RATE_LIMIT: "on", ...SMTP };
const ADMIN = "first.admin@nltag.test";

describe("staff-only sign-up allowlist (Phase 6a)", () => {
  it("fails closed in production when the list is unset or blank", () => {
    for (const v of [undefined, "", "   ", " , ,"]) {
      const e = v === undefined ? env({ NODE_ENV: "production" }) : env({ NODE_ENV: "production", NLTAG_SIGNUP_ALLOWLIST: v });
      expect(signupPolicy(e)).toEqual({ kind: "closed", reason: "not-set" });
      expect(signupAllowed(ADMIN, signupPolicy(e))).toBe(false);
    }
  });

  it("refuses everyone when any entry is not an email address", () => {
    for (const v of [`${ADMIN},not-an-email`, "*", "@nltag.test", `${ADMIN};other@nltag.test`, "nltag.test"]) {
      for (const NODE_ENV of ["production", "development", "test"]) {
        const p = signupPolicy(env({ NODE_ENV, NLTAG_SIGNUP_ALLOWLIST: v }));
        expect(p, v).toEqual({ kind: "closed", reason: "invalid" });
        expect(signupAllowed(ADMIN, p)).toBe(false);
      }
    }
  });

  it("allows only listed addresses, ignoring case and spaces", () => {
    const p = signupPolicy(env({ NODE_ENV: "production", NLTAG_SIGNUP_ALLOWLIST: ` First.Admin@NLTAG.test , editor@nltag.test ` }));
    expect(p.kind).toBe("allowlist");
    expect(signupAllowed(ADMIN, p)).toBe(true);
    expect(signupAllowed("  FIRST.ADMIN@nltag.test ", p)).toBe(true);
    expect(signupAllowed("editor@nltag.test", p)).toBe(true);
    for (const other of ["someone@nltag.test", "first.admin@nltag.test.evil.example", "admin@nltag.test", "first.admin+x@nltag.test", ""]) {
      expect(signupAllowed(other, p), other).toBe(false);
    }
  });

  it("is open only outside production with no list (local development and tests)", () => {
    expect(signupPolicy(env({ NODE_ENV: "development" }))).toEqual({ kind: "open" });
    expect(signupPolicy(env({ NODE_ENV: "test" }))).toEqual({ kind: "open" });
    expect(signupPolicy(env({}))).toEqual({ kind: "open" });
  });

  it("is enforced in the user-create hook, so it covers every sign-up method", () => {
    const src = readFileSync("src/server/auth/auth.ts", "utf8");
    expect(src).toMatch(/create:\s*{\s*before:\s*async[\s\S]*?signupAllowed\(u\.email, policy\)[\s\S]*?new APIError\("FORBIDDEN"\)/);
  });
});

describe("first Church Admin bootstrap from the environment (Phase 6a)", () => {
  const listed = { ...OPEN_PROD, NLTAG_SIGNUP_ALLOWLIST: `${ADMIN},editor@nltag.test` };

  it("does nothing when the variable is unset or blank", () => {
    for (const v of [undefined, "", "  "]) {
      const e = v === undefined ? env(listed) : env({ ...listed, NLTAG_BOOTSTRAP_ADMIN_EMAIL: v });
      const d = decideBootstrap(e);
      expect(d.run).toBe(false);
      expect(d.run ? "" : d.message).toMatch(/^No admin bootstrap requested/);
    }
  });

  it("refuses anything but one valid address", () => {
    for (const v of ["not-an-email", `${ADMIN},editor@nltag.test`, "a b@nltag.test", "@nltag.test"]) {
      const d = decideBootstrap(env({ ...listed, NLTAG_BOOTSTRAP_ADMIN_EMAIL: v }));
      expect(d.run, v).toBe(false);
    }
  });

  it("refuses while the accounts gate is closed (flag, SMTP or rate limiting missing)", () => {
    for (const drop of ["NLTAG_ACCOUNTS_ENABLED", "SMTP_PASS", "AUTH_RATE_LIMIT"]) {
      const e: Record<string, string> = { ...listed, NLTAG_BOOTSTRAP_ADMIN_EMAIL: ADMIN };
      delete e[drop];
      const d = decideBootstrap(env(e));
      expect(d.run, drop).toBe(false);
      expect(d.run ? "" : d.message, drop).toMatch(/accounts are not enabled/);
    }
  });

  it("refuses when the allowlist is missing, invalid or does not list the address", () => {
    const base = { ...OPEN_PROD, NLTAG_BOOTSTRAP_ADMIN_EMAIL: ADMIN };
    expect(decideBootstrap(env(base)).run).toBe(false);
    expect(decideBootstrap(env({ ...base, NLTAG_SIGNUP_ALLOWLIST: "x" })).run).toBe(false);
    const d = decideBootstrap(env({ ...base, NLTAG_SIGNUP_ALLOWLIST: "editor@nltag.test" }));
    expect(d.run ? "" : d.message).toMatch(/not on NLTAG_SIGNUP_ALLOWLIST/);
  });

  it("runs for a listed address with accounts open, normalising case", () => {
    expect(decideBootstrap(env({ ...listed, NLTAG_BOOTSTRAP_ADMIN_EMAIL: " First.Admin@NLTAG.test " }))).toEqual({ run: true, email: ADMIN });
  });

  it("never prints the address or the user id, and never throws", async () => {
    const e = env({ ...listed, NLTAG_BOOTSTRAP_ADMIN_EMAIL: ADMIN });
    const ok = await runEnvBootstrap(e, { bootstrap: async () => "user-id-123", reasonOf: () => "x" });
    expect(ok.granted).toBe(true);
    const failed = await runEnvBootstrap(e, {
      bootstrap: async () => {
        throw new Error(`boom ${ADMIN}`);
      },
      reasonOf: () => "a Church Admin already exists",
    });
    expect(failed).toEqual({ granted: false, message: "Admin bootstrap not done: a Church Admin already exists" });
    for (const m of [ok.message, failed.message]) {
      expect(m).not.toContain(ADMIN);
      expect(m).not.toContain("user-id-123");
    }
  });

  it("does not call the database when a precondition fails", async () => {
    const bootstrap = vi.fn(async () => "id");
    await runEnvBootstrap(env({ ...OPEN_PROD, NLTAG_BOOTSTRAP_ADMIN_EMAIL: ADMIN }), { bootstrap, reasonOf: () => "" });
    await runEnvBootstrap(env({ ...listed }), { bootstrap, reasonOf: () => "" });
    expect(bootstrap).not.toHaveBeenCalled();
  });
});

describe("Hostinger build script (Phase 6a)", () => {
  const build = readFileSync("scripts/hostinger-build.mjs", "utf8");
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };

  it("runs the bootstrap only when its variable is set, never together with a migration", () => {
    expect(build).toMatch(/migration && bootstrap[\s\S]*?process\.exit\(1\)/);
    expect(build).toContain('run("npm", ["run", "admin:bootstrap:env"]');
    expect(pkg.scripts["admin:bootstrap:env"]).toContain("scripts/db/bootstrap-admin-from-env.ts");
  });

  it("no longer contains the SMTP Stage A test mechanism", () => {
    expect(build).not.toMatch(/SMTP_TEST|smtp-test|smtp-delivery/);
    expect(pkg.scripts["email:smtp-test"]).toBeUndefined();
    expect(JSON.stringify(pkg.scripts)).not.toMatch(/smtp/i);
  });
});
