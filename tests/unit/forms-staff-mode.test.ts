// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { formsConfigProblem, formsConfigured, formsMode, formsOpenTo, formsOpenToEveryone } from "@/server/forms/mode";
import { resetServerEnvForTests, serverEnv } from "@/server/env";
import type { Principal } from "@/server/policy/permissions";
import type { StaffRole } from "@/server/db/schema";

/**
 * NLTAG_PUBLIC_FORMS=staff: staging-only test mode (owner approval 10 Nov 2026). Production must
 * fail closed (resolve to "off"), refuse to run (serverEnv) and refuse to build (Hostinger build).
 */
const STAGING = { NODE_ENV: "production", NLTAG_DEPLOYMENT: "staging" };
const PRODUCTION = { NODE_ENV: "production" };
const LOCAL = { NODE_ENV: "development" };

const user = (roles: StaffRole[], opts: { verified?: boolean; twoFactor?: boolean } = {}): Principal => ({
  kind: "user",
  userId: "u",
  emailVerified: opts.verified ?? true,
  roles,
  twoFactorEnabled: opts.twoFactor ?? true,
});
const VISITOR: Principal = { kind: "visitor" };

describe("forms mode", () => {
  it("resolves the switch per deployment; 'staff' is never honoured by production", () => {
    for (const base of [STAGING, LOCAL]) {
      expect(formsMode({ ...base, NLTAG_PUBLIC_FORMS: "staff" })).toBe("staff");
      expect(formsMode({ ...base, NLTAG_PUBLIC_FORMS: " staff " })).toBe("staff");
    }
    expect(formsMode({ ...PRODUCTION, NLTAG_PUBLIC_FORMS: "staff" })).toBe("off");
    // Declared production without NODE_ENV=production is treated as production too.
    expect(formsMode({ ...LOCAL, NLTAG_DEPLOYMENT: "production", NLTAG_PUBLIC_FORMS: "staff" })).toBe("off");
    for (const base of [STAGING, PRODUCTION, LOCAL]) {
      expect(formsMode({ ...base, NLTAG_PUBLIC_FORMS: "1" })).toBe("public");
      for (const v of [undefined, "", "0", "true", "yes", "STAFF", "staff,1"]) expect(formsMode({ ...base, NLTAG_PUBLIC_FORMS: v }), String(v)).toBe("off");
    }
  });

  it("inboxes work in both 'public' and 'staff'; only 'public' advertises the forms", () => {
    expect(formsConfigured({ ...STAGING, NLTAG_PUBLIC_FORMS: "staff" })).toBe(true);
    expect(formsOpenToEveryone({ ...STAGING, NLTAG_PUBLIC_FORMS: "staff" })).toBe(false);
    expect(formsConfigured({ ...PRODUCTION, NLTAG_PUBLIC_FORMS: "staff" })).toBe(false);
    expect(formsOpenToEveryone({ ...PRODUCTION, NLTAG_PUBLIC_FORMS: "1" })).toBe(true);
  });

  it("staff mode opens the forms only to verified staff, with two-factor where the role requires it", () => {
    const env = { ...STAGING, NLTAG_PUBLIC_FORMS: "staff" };
    const allowed: [string, Principal][] = [
      ["church admin with two-factor", user(["CHURCH_ADMIN"])],
      ["content editor (two-factor optional)", user(["CONTENT_EDITOR"], { twoFactor: false })],
      ["prayer team with two-factor", user(["PRAYER_TEAM"])],
    ];
    const refused: [string, Principal][] = [
      ["visitor", VISITOR],
      ["member without a role", user([])],
      ["unverified content editor", user(["CONTENT_EDITOR"], { verified: false })],
      ["unverified prayer team", user(["PRAYER_TEAM"], { verified: false })],
      ["prayer team without two-factor", user(["PRAYER_TEAM"], { twoFactor: false })],
      ["church admin without two-factor", user(["CHURCH_ADMIN"], { twoFactor: false })],
    ];
    for (const [label, p] of allowed) expect(formsOpenTo(p, env), label).toBe(true);
    for (const [label, p] of refused) expect(formsOpenTo(p, env), label).toBe(false);
    // Production with 'staff': nobody, not even a Church Admin.
    expect(formsOpenTo(user(["CHURCH_ADMIN"]), { ...PRODUCTION, NLTAG_PUBLIC_FORMS: "staff" })).toBe(false);
    // Unchanged: off → nobody; public → everyone.
    expect(formsOpenTo(user(["CHURCH_ADMIN"]), { ...STAGING })).toBe(false);
    expect(formsOpenTo(VISITOR, { ...PRODUCTION, NLTAG_PUBLIC_FORMS: "1" })).toBe(true);
  });

  it("the configuration guard names production + 'staff' as a problem, and nothing else", () => {
    expect(formsConfigProblem({ ...PRODUCTION, NLTAG_PUBLIC_FORMS: "staff" })).toMatch(/NLTAG_PUBLIC_FORMS: 'staff' is a staging-only test mode/);
    expect(formsConfigProblem({ ...LOCAL, NLTAG_DEPLOYMENT: "production", NLTAG_PUBLIC_FORMS: "staff" })).not.toBeNull();
    for (const env of [{ ...STAGING, NLTAG_PUBLIC_FORMS: "staff" }, { ...LOCAL, NLTAG_PUBLIC_FORMS: "staff" }, { ...PRODUCTION, NLTAG_PUBLIC_FORMS: "1" }, { ...PRODUCTION }]) {
      expect(formsConfigProblem(env)).toBeNull();
    }
  });
});

describe("production refuses NLTAG_PUBLIC_FORMS=staff", () => {
  const LIVE = {
    NODE_ENV: "production",
    BETTER_AUTH_URL: "https://www.example.org",
    BETTER_AUTH_SECRET: "a-real-looking-secret-of-sufficient-length-0123456789",
    DATABASE_URL: "mysql://site:a-real-password@127.0.0.1:3306/site_db",
  } as const;
  const saved = { ...process.env };
  afterEach(() => {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
    resetServerEnvForTests();
  });

  it("serverEnv() throws at start-up, naming the variable only", () => {
    Object.assign(process.env, LIVE, { NLTAG_PUBLIC_FORMS: "staff" });
    delete process.env.NLTAG_DEPLOYMENT;
    resetServerEnvForTests();
    expect(() => serverEnv()).toThrow(/NLTAG_PUBLIC_FORMS: 'staff' is a staging-only test mode/);
  });

  it("serverEnv() starts with the forms off or open (unchanged)", () => {
    for (const v of ["", "1"]) {
      Object.assign(process.env, LIVE, { NLTAG_PUBLIC_FORMS: v });
      delete process.env.NLTAG_DEPLOYMENT;
      resetServerEnvForTests();
      expect(serverEnv().BETTER_AUTH_URL).toBe(LIVE.BETTER_AUTH_URL);
    }
  });

  it("the Hostinger production build exits before running anything", () => {
    const env = { PATH: process.env.PATH, HOME: process.env.HOME, NLTAG_PUBLIC_FORMS: "staff" } as unknown as NodeJS.ProcessEnv;
    const r = spawnSync(process.execPath, ["scripts/hostinger-build.mjs"], { env, encoding: "utf8", timeout: 20_000 });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Refused: NLTAG_PUBLIC_FORMS=staff");
    expect(r.stdout).not.toMatch(/migration|next build|bootstrap/i);
  });

  it("the staging build path is not affected (the refusal sits after the staging block)", () => {
    const build = readFileSync("scripts/hostinger-build.mjs", "utf8");
    expect(build.indexOf("Refused: NLTAG_PUBLIC_FORMS=staff")).toBeGreaterThan(build.indexOf("process.exit(0);"));
    // …and before any production step.
    for (const step of ['"db:migrate"', '"next", "build"', '"admin:bootstrap:env"']) {
      expect(build.indexOf("Refused: NLTAG_PUBLIC_FORMS=staff"), step).toBeLessThan(build.lastIndexOf(step));
    }
  });
});

describe("every public entry point asks who is calling (not only the page)", () => {
  const read = (p: string) => readFileSync(p, "utf8");
  it("server actions pass the session's principal to every submission", () => {
    const actions = read("src/app/[locale]/form-actions.ts");
    expect(actions).toContain("await submit(locale, f, Date.now(), await formsViewer())");
    for (const fn of ["prayer", "contact", "testimony"]) expect(actions).toMatch(new RegExp(`handle\\("${fn}", submit\\w+, prev, f\\)`));
    const service = read("src/server/forms/service.ts");
    // Each submission runs the gate with the viewer before validation or storage.
    for (const fn of ["submitPrayer", "submitContact", "submitTestimony"]) {
      const body = service.slice(service.indexOf(`export async function ${fn}(`));
      expect(body.split("\n")[1], fn).toMatch(/await gate\("\w+", f, now, viewer\)/);
    }
    expect(service).toMatch(/viewer: Principal = VISITOR/);
  });

  it("form pages and the gallery 404 unless the viewer may use them", () => {
    for (const p of ["src/app/[locale]/prayer/page.tsx", "src/app/[locale]/testimonies/share/page.tsx", "src/app/[locale]/gallery/page.tsx"]) {
      const s = read(p);
      expect(s, p).toMatch(/const viewer = await formsViewer\(\);\n\s+if \(!formsOpenTo\(viewer\)\) notFound\(\);/);
      expect(s, p).not.toContain("publicFormsEnabled");
    }
    expect(read("src/app/[locale]/contact/page.tsx")).toMatch(/formsOpenTo\(viewer\) \?/);
    // Links are advertised only when the forms are open to everyone.
    expect(read("src/app/[locale]/_components/PublicShell.tsx")).toContain("formsOpenToEveryone()");
    expect(read("src/app/[locale]/testimonies/page.tsx")).toContain("formsOpenToEveryone()");
    // Image copies: viewer checked; never publicly cached in staff mode.
    const route = read("src/app/gallery-image/[id]/[width]/route.ts");
    expect(route).toContain("publicVariant(id, w, await formsViewer(req.headers))");
    expect(route).toContain('formsMode() === "staff" ? "private, no-store"');
  });
});
