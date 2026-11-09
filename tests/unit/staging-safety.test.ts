// @vitest-environment node
// Staging isolation (docs/operations/staging.md): staging must refuse production resources, fail
// closed, and leave production behaviour unchanged. The live database checks run against MariaDB
// in tests/integration/staging-isolation.test.ts.
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  databaseNameOf,
  deploymentConfigProblems,
  deploymentKind,
  isReservedTestAddress,
  STAGING_SECRET_PREFIX,
  stagingMailDir,
  stagingMailMode,
  titlePrefix,
} from "@/server/deployment/environment";
import { migrationTargetProblems } from "@/server/deployment/migration-target";
import { publicOrigin } from "@/server/deployment/public-origin";
import { assertStagingVerified, databaseIdentityProblems, mediaFolderProblems, MEDIA_MARKER_FILE, resetVerificationForTests, verificationState, verifyDeployment } from "@/server/deployment/verify";
import { accountsEnabled } from "@/server/accounts-gate";

const HOME = "/home/u339364475";
const STAGING_SECRET = `${STAGING_SECRET_PREFIX}${"x".repeat(48)}`;

/** A complete, valid staging configuration (fictional values). */
const STAGING: Record<string, string> = {
  NODE_ENV: "production",
  NLTAG_DEPLOYMENT: "staging",
  BETTER_AUTH_URL: "https://staging.nltagkuwait.com",
  BETTER_AUTH_SECRET: STAGING_SECRET,
  DATABASE_URL: "mysql://u339364475_staging:pw@127.0.0.1:3306/u339364475_staging",
  NLTAG_MEDIA_DIR: `${HOME}/nltag-data-staging/media`,
  AUTH_RATE_LIMIT: "on",
};
const stg = (over: Record<string, string | undefined> = {}) => ({ ...STAGING, ...over });
/** A production-shaped configuration (fictional values). */
const PROD: Record<string, string> = {
  NODE_ENV: "production",
  BETTER_AUTH_URL: "https://nltagkuwait.com",
  BETTER_AUTH_SECRET: "random-production-like-secret-0123456789abcdefghijklmnop",
  DATABASE_URL: "mysql://u339364475_nltag:pw@127.0.0.1:3306/u339364475_nltag",
};

describe("deployment kind", () => {
  it("is staging only when NLTAG_DEPLOYMENT=staging", () => {
    expect(deploymentKind(STAGING)).toBe("staging");
    expect(deploymentKind(PROD)).toBe("production");
    expect(deploymentKind({ NODE_ENV: "development" })).toBe("local");
    expect(deploymentKind({ NODE_ENV: "test", NLTAG_DEPLOYMENT: "production" })).toBe("local");
  });
  it("prefixes titles on staging only", () => {
    expect(titlePrefix(STAGING)).toBe("[STAGING] ");
    expect(titlePrefix(PROD)).toBe("");
  });
  it("uses staging's own origin for canonical and preview URLs, production's unchanged", () => {
    expect(publicOrigin("https://nltagkuwait.com", STAGING)).toBe("https://staging.nltagkuwait.com");
    expect(publicOrigin("https://nltagkuwait.com", PROD)).toBe("https://nltagkuwait.com");
  });
});

describe("staging configuration validation (fails closed)", () => {
  it("accepts a complete staging configuration", () => {
    expect(deploymentConfigProblems(STAGING, HOME)).toEqual([]);
  });

  it("refuses the production database URL", () => {
    const p = deploymentConfigProblems(stg({ DATABASE_URL: PROD.DATABASE_URL }), HOME);
    expect(p.join()).toMatch(/database name must contain 'staging'/);
    expect(p.join()).toMatch(/database user must contain 'staging'/);
  });

  it("refuses the production auth secret (or any secret without the staging prefix)", () => {
    expect(deploymentConfigProblems(stg({ BETTER_AUTH_SECRET: PROD.BETTER_AUTH_SECRET }), HOME).join()).toMatch(/BETTER_AUTH_SECRET/);
    expect(deploymentConfigProblems(stg({ BETTER_AUTH_SECRET: `${STAGING_SECRET_PREFIX}short` }), HOME).join()).toMatch(/BETTER_AUTH_SECRET/);
  });

  it("refuses a missing, relative, production or production-overlapping media folder", () => {
    expect(deploymentConfigProblems(stg({ NLTAG_MEDIA_DIR: undefined }), HOME).join()).toMatch(/NLTAG_MEDIA_DIR: staging must set/);
    expect(deploymentConfigProblems(stg({ NLTAG_MEDIA_DIR: "nltag-data-staging/media" }), HOME).join()).toMatch(/absolute/);
    expect(deploymentConfigProblems(stg({ NLTAG_MEDIA_DIR: `${HOME}/nltag-data/media` }), HOME).join()).toMatch(/name staging/);
    expect(deploymentConfigProblems(stg({ NLTAG_MEDIA_DIR: `${HOME}/nltag-data/staging` }), HOME).join()).toMatch(/production data folder/);
    expect(deploymentConfigProblems(stg({ NLTAG_MEDIA_DIR: `${HOME}/nltag-data/media/../staging-x` }), HOME).join()).toMatch(/production data folder/);
  });

  it("refuses real mail providers; capture is the default; sandbox hosts only", () => {
    expect(stagingMailMode(STAGING)).toBe("capture");
    const gmail = { SMTP_HOST: "smtp.gmail.com", SMTP_USER: "u", SMTP_PASS: "p", SMTP_FROM: "f@example.com" };
    expect(deploymentConfigProblems(stg(gmail), HOME).join()).toMatch(/SMTP_\*: staging captures mail/);
    expect(deploymentConfigProblems(stg({ ...gmail, NLTAG_STAGING_MAIL: "sandbox" }), HOME).join()).toMatch(/mail sandbox/);
    expect(deploymentConfigProblems(stg({ ...gmail, SMTP_HOST: "sandbox.smtp.mailtrap.io", NLTAG_STAGING_MAIL: "sandbox" }), HOME)).toEqual([]);
    expect(deploymentConfigProblems(stg({ NLTAG_STAGING_MAIL: "deliver" }), HOME).join()).toMatch(/NLTAG_STAGING_MAIL/);
  });

  it("captures mail next to the staging media folder unless a folder is configured", () => {
    expect(stagingMailDir(STAGING)).toBe(`${HOME}/nltag-data-staging/mail-capture`);
    expect(stagingMailDir(stg({ NLTAG_STAGING_MAIL_DIR: "/tmp/x" }))).toBe("/tmp/x");
    expect(stagingMailDir(stg({ NLTAG_STAGING_MAIL_DIR: "relative" }))).toBeNull();
  });

  it("refuses production one-off operations and the church's Google client", () => {
    expect(deploymentConfigProblems(stg({ NLTAG_APPROVED_PRODUCTION_MIGRATION: "1" }), HOME).join()).toMatch(/NLTAG_APPROVED_PRODUCTION_MIGRATION/);
    expect(deploymentConfigProblems(stg({ NLTAG_BOOTSTRAP_ADMIN_EMAIL: "a@nltag.test" }), HOME).join()).toMatch(/production admin bootstrap/);
    expect(deploymentConfigProblems(stg({ GOOGLE_CLIENT_ID: "x", GOOGLE_CLIENT_SECRET: "y" }), HOME).join()).toMatch(/GOOGLE/);
  });

  it("allows only reserved test addresses for staff sign-up, the staging admin and notifications", () => {
    expect(deploymentConfigProblems(stg({ NLTAG_SIGNUP_ALLOWLIST: "a@nltag.test,b@example.com" }), HOME)).toEqual([]);
    expect(deploymentConfigProblems(stg({ NLTAG_SIGNUP_ALLOWLIST: "a@nltag.test,real@gmail.com" }), HOME).join()).toMatch(/NLTAG_SIGNUP_ALLOWLIST/);
    expect(deploymentConfigProblems(stg({ NLTAG_STAGING_BOOTSTRAP_ADMIN_EMAIL: "pastor@gmail.com" }), HOME).join()).toMatch(/reserved test address/);
    expect(deploymentConfigProblems(stg({ NLTAG_CHURCH_INBOX: "office@nltagkuwait.com" }), HOME).join()).toMatch(/NLTAG_CHURCH_INBOX/);
    expect(isReservedTestAddress("x@nltag.test")).toBe(true);
    expect(isReservedTestAddress("x@nltagkuwait.com")).toBe(false);
    expect(isReservedTestAddress("x@test.com")).toBe(false);
  });

  it("requires https on a staging address, and NODE_ENV=production", () => {
    expect(deploymentConfigProblems(stg({ BETTER_AUTH_URL: "http://staging.nltagkuwait.com" }), HOME).join()).toMatch(/https/);
    expect(deploymentConfigProblems(stg({ BETTER_AUTH_URL: "https://nltagkuwait.com" }), HOME).join()).toMatch(/name staging/);
    expect(deploymentConfigProblems(stg({ NODE_ENV: "development" }), HOME).join()).toMatch(/NODE_ENV/);
    // Local simulation of staging on this machine is allowed.
    expect(deploymentConfigProblems(stg({ BETTER_AUTH_URL: "http://127.0.0.1:3200" }), HOME)).toEqual([]);
  });

  it("refuses a staging address that forgot NLTAG_DEPLOYMENT (it would otherwise act as production)", () => {
    const forgot = stg({ NLTAG_DEPLOYMENT: undefined });
    expect(deploymentKind(forgot)).toBe("production");
    expect(deploymentConfigProblems(forgot, HOME).join()).toMatch(/must set NLTAG_DEPLOYMENT=staging/);
  });

  it("leaves a production configuration unchanged, but refuses staging values in production", () => {
    expect(deploymentConfigProblems(PROD, HOME)).toEqual([]);
    expect(deploymentConfigProblems({ ...PROD, BETTER_AUTH_SECRET: STAGING_SECRET }, HOME).join()).toMatch(/staging secret must not run production/);
    expect(deploymentConfigProblems({ ...PROD, DATABASE_URL: STAGING.DATABASE_URL }, HOME).join()).toMatch(/staging database must not run production/);
    expect(deploymentConfigProblems({ ...PROD, NLTAG_MEDIA_DIR: STAGING.NLTAG_MEDIA_DIR }, HOME).join()).toMatch(/staging media folder/);
    expect(deploymentConfigProblems({ ...PROD, NLTAG_DEPLOYMENT: "prod" }, HOME).join()).toMatch(/NLTAG_DEPLOYMENT/);
  });

  it("never echoes a value in a problem message", () => {
    const leaky = stg({ DATABASE_URL: "mysql://SECRETUSER:SECRETPW@db.example:3306/SECRETDB", BETTER_AUTH_SECRET: "SECRETVALUE".repeat(5) });
    const text = deploymentConfigProblems(leaky, HOME).join(" ");
    for (const v of ["SECRETUSER", "SECRETPW", "SECRETDB", "SECRETVALUE"]) expect(text).not.toContain(v);
  });

  it("reads the database name from the URL", () => {
    expect(databaseNameOf(STAGING.DATABASE_URL)).toBe("u339364475_staging");
    expect(databaseNameOf("mysql://u:p@h:3306/")).toBeNull();
    expect(databaseNameOf("not a url")).toBeNull();
  });
});

describe("migration targeting", () => {
  it("staging migrations need the staging deployment and a staging database, never the production flag", () => {
    expect(migrationTargetProblems(STAGING, true)).toEqual([]);
    expect(migrationTargetProblems(PROD, true).join()).toMatch(/NLTAG_DEPLOYMENT=staging/);
    expect(migrationTargetProblems(stg({ NLTAG_APPROVED_PRODUCTION_MIGRATION: "1" }), true).join()).toMatch(/production approval flag/);
    expect(migrationTargetProblems(stg({ DATABASE_URL: PROD.DATABASE_URL }), true).join()).toMatch(/does not contain 'staging'/);
  });
  it("the ordinary migration path refuses staging, and production without the owner's flag (unchanged)", () => {
    expect(migrationTargetProblems(STAGING, false).join()).toMatch(/staging:migrate/);
    expect(migrationTargetProblems(PROD, false).join()).toMatch(/NLTAG_APPROVED_PRODUCTION_MIGRATION=1/);
    expect(migrationTargetProblems({ ...PROD, NLTAG_APPROVED_PRODUCTION_MIGRATION: "1" }, false)).toEqual([]);
    expect(migrationTargetProblems({ ...PROD, NLTAG_APPROVED_PRODUCTION_MIGRATION: "1", DATABASE_URL: STAGING.DATABASE_URL }, false).join()).toMatch(/staging database/);
    expect(migrationTargetProblems({ NODE_ENV: "development", DATABASE_URL: "mysql://u:p@127.0.0.1/nltag_dev" }, false)).toEqual([]);
  });
});

describe("media folder (live check)", () => {
  const root = () => mkdtempSync(path.join(os.tmpdir(), "nltag-staging-"));

  it("claims a new empty staging folder and accepts it afterwards", async () => {
    const home = root();
    const dir = path.join(home, "nltag-data-staging", "media");
    expect(await mediaFolderProblems(dir, home)).toEqual([]);
    expect(readFileSync(path.join(dir, MEDIA_MARKER_FILE), "utf8").trim()).toBe("staging");
    expect(await mediaFolderProblems(dir, home)).toEqual([]);
  });

  it("refuses a folder that already holds files without the staging marker (e.g. production's)", async () => {
    const home = root();
    const dir = path.join(home, "nltag-data-staging", "media");
    mkdirSync(path.join(dir, "ab"), { recursive: true });
    writeFileSync(path.join(dir, ".nltag-storage-marker.json"), "{}");
    expect((await mediaFolderProblems(dir, home)).join()).toMatch(/no staging marker/);
    expect(readdirSync(dir)).not.toContain(MEDIA_MARKER_FILE);
  });

  it("refuses a staging-named path that is a symlink into the production data folder", async () => {
    const home = root();
    const prod = path.join(home, "nltag-data", "media");
    mkdirSync(prod, { recursive: true });
    mkdirSync(path.join(home, "nltag-data-staging"), { recursive: true });
    const link = path.join(home, "nltag-data-staging", "media");
    symlinkSync(prod, link);
    expect((await mediaFolderProblems(link, home)).join()).toMatch(/resolves into the production data folder/);
    expect(readdirSync(prod)).toEqual([]);
  });

  it("refuses a folder whose marker names another environment", async () => {
    const home = root();
    const dir = path.join(home, "nltag-data-staging", "media");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, MEDIA_MARKER_FILE), "production\n");
    expect((await mediaFolderProblems(dir, home)).join()).toMatch(/does not say staging/);
  });
});

describe("fail closed until verified", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    resetVerificationForTests();
  });

  it("staging refuses database, media and mail use before the live check passes", () => {
    process.env = { ...saved, ...STAGING };
    resetVerificationForTests();
    expect(verificationState().status).toBe("pending");
    expect(() => assertStagingVerified("database access")).toThrow(/Staging safety check: database access refused/);
  });

  it("a failed check stays failed and names rules, not values", async () => {
    const env = stg({ DATABASE_URL: PROD.DATABASE_URL });
    const state = await verifyDeployment(env);
    expect(state.status).toBe("failed");
    process.env = { ...saved, ...env };
    expect(() => assertStagingVerified("media storage")).toThrow(/database name must contain 'staging'/);
  });

  it("production and local are never blocked by the staging check", () => {
    process.env = { ...saved, ...PROD };
    resetVerificationForTests();
    expect(() => assertStagingVerified("database access")).not.toThrow();
  });
});

describe("accounts gate on staging", () => {
  it("opens with captured mail but still requires the explicit rate-limit switch", () => {
    expect(accountsEnabled({ ...STAGING, NLTAG_ACCOUNTS_ENABLED: "1" } as unknown as NodeJS.ProcessEnv)).toBe(true);
    expect(accountsEnabled({ ...STAGING, NLTAG_ACCOUNTS_ENABLED: "1", AUTH_RATE_LIMIT: "" } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(accountsEnabled({ ...STAGING } as unknown as NodeJS.ProcessEnv)).toBe(false);
    // Production unchanged: SMTP still required.
    expect(accountsEnabled({ ...PROD, NLTAG_ACCOUNTS_ENABLED: "1", AUTH_RATE_LIMIT: "on" } as unknown as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe("Hostinger build script (staging path)", () => {
  const build = readFileSync("scripts/hostinger-build.mjs", "utf8");
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
  it("verifies staging before any staging migration, seed or build, and refuses production flags in staging", () => {
    const stagingBlock = build.slice(build.indexOf("if (staging) {"), build.indexOf("process.exit(0);"));
    expect(stagingBlock).toMatch(/migration \|\| bootstrap[\s\S]*?process\.exit\(1\)/);
    const verify = stagingBlock.indexOf('"staging:verify"');
    expect(verify).toBeGreaterThan(-1);
    for (const step of ['"staging:migrate"', '"staging:seed"', '"next", "build"', '"staging:bootstrap"']) expect(stagingBlock.indexOf(step), step).toBeGreaterThan(verify);
    expect(stagingBlock).not.toContain("db:migrate");
    expect(stagingBlock).not.toContain("admin:bootstrap:env");
    expect(pkg.scripts["staging:migrate"]).toContain("migrate.ts --staging");
  });
});

describe("database identity (state machine; the SQL runs against MariaDB in the integration suite)", () => {
  type Row = Record<string, unknown>;
  /** Minimal fake connection answering the three queries verify.ts makes. */
  function fakeConn(db: string, tables: string[], marker?: string) {
    const writes: string[] = [];
    const conn = {
      writes,
      async query(sqlText: string, params?: unknown[]) {
        if (sqlText.startsWith("SELECT DATABASE()")) return [[{ db }] as Row[]];
        if (sqlText.includes("information_schema.TABLES")) return [tables.map((t) => ({ t })) as Row[]];
        if (sqlText.startsWith("SELECT v FROM")) return [(marker === undefined ? [] : [{ v: marker }]) as Row[]];
        writes.push(sqlText.split(" ").slice(0, 3).join(" "));
        if (sqlText.startsWith("CREATE TABLE")) tables.push("nltag_environment");
        if (sqlText.startsWith("INSERT")) marker = String(params?.[0]);
        return [[]];
      },
    };
    return conn;
  }


  it("refuses a database whose real name lacks 'staging', without writing", async () => {
    const c = fakeConn("u339364475_nltag", ["user", "content_item"]);
    expect((await databaseIdentityProblems(c as never, { claimIfEmpty: true })).join()).toMatch(/does not contain 'staging'/);
    expect(c.writes).toEqual([]);
  });
  it("refuses a staging-named database that has tables but no marker, without writing", async () => {
    const c = fakeConn("u339364475_staging", ["user"]);
    expect((await databaseIdentityProblems(c as never, { claimIfEmpty: true })).join()).toMatch(/no staging marker/);
    expect(c.writes).toEqual([]);
  });
  it("claims an empty staging database only when asked (staging:init), never at runtime", async () => {
    const runtime = fakeConn("u339364475_staging", []);
    expect((await databaseIdentityProblems(runtime as never)).join()).toMatch(/not yet claimed/);
    expect(runtime.writes).toEqual([]);
    const init = fakeConn("u339364475_staging", []);
    expect(await databaseIdentityProblems(init as never, { claimIfEmpty: true })).toEqual([]);
    expect(init.writes).toEqual(["CREATE TABLE nltag_environment", "INSERT INTO nltag_environment"]);
    expect(await databaseIdentityProblems(init as never)).toEqual([]);
  });
  it("refuses a marker naming another environment", async () => {
    const c = fakeConn("u339364475_staging", ["nltag_environment", "user"], "production");
    expect((await databaseIdentityProblems(c as never)).join()).toMatch(/does not say staging/);
  });
});

describe("email suppression on staging", () => {
  const saved = { ...process.env };
  const KEY = Symbol.for("nltag.deployment.verification");
  afterEach(async () => {
    process.env = { ...saved };
    resetVerificationForTests();
    const { resetServerEnvForTests } = await import("@/server/env");
    const { resetTransportForTests } = await import("@/server/email/transport");
    resetServerEnvForTests();
    resetTransportForTests();
  });

  it("captures every message to the staging mail folder and never opens an SMTP connection", async () => {
    const home = mkdtempSync(path.join(os.tmpdir(), "nltag-mail-"));
    const mailDir = path.join(home, "nltag-data-staging", "mail-capture");
    process.env = { ...saved, ...STAGING, NLTAG_MEDIA_DIR: path.join(home, "nltag-data-staging", "media"), NLTAG_STAGING_MAIL_DIR: mailDir };
    (globalThis as Record<symbol, unknown>)[KEY] = { status: "verified" };
    const nodemailer = (await import("nodemailer")).default;
    const spy = vi.spyOn(nodemailer, "createTransport");
    const { getTransport, memoryOutbox } = await import("@/server/email/transport");
    const t = getTransport();
    expect(t.name).toBe("staging-capture");
    await t.send({ to: "someone@nltag.test", subject: "Set your password", text: "link", html: "<p>link</p>" });
    expect(spy).not.toHaveBeenCalled();
    expect(memoryOutbox).toHaveLength(0);
    const files = readdirSync(mailDir);
    expect(files).toHaveLength(1);
    const saved1 = JSON.parse(readFileSync(path.join(mailDir, files[0]!), "utf8")) as { subject: string; capturedBy: string };
    expect(saved1.subject).toBe("[STAGING] Set your password");
    expect(saved1.capturedBy).toBe("staging");
  });

  it("refuses to capture before the staging check has passed", async () => {
    const home = mkdtempSync(path.join(os.tmpdir(), "nltag-mail-"));
    process.env = { ...saved, ...STAGING, NLTAG_MEDIA_DIR: path.join(home, "nltag-data-staging", "media") };
    resetVerificationForTests();
    const { getTransport } = await import("@/server/email/transport");
    await expect(getTransport().send({ to: "a@nltag.test", subject: "s", text: "t", html: "h" })).rejects.toThrow(/mail capture refused/);
  });

  it("a staging configuration with real SMTP never gets a transport at all", async () => {
    process.env = { ...saved, ...STAGING, SMTP_HOST: "smtp.gmail.com", SMTP_USER: "u", SMTP_PASS: "p", SMTP_FROM: "f@example.com" };
    const { getTransport } = await import("@/server/email/transport");
    expect(() => getTransport()).toThrow(/staging captures mail/);
  });
});
