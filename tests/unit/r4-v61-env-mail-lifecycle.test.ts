// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { productionGuardProblems, resetServerEnvForTests, serverEnv } from "@/server/env";
import { smtpOptions } from "@/server/email/transport";
import { isTransientMailError, SMTP_RETRY_DELAYS_MS } from "@/server/email/send";
import { drain, isDraining, registerDrainWaiter, resetLifecycleForTests } from "@/server/lifecycle";

/** R4 v6.1 §5 (production guard, SMTP TLS) and §2 (retry classification, graceful drain). */

const LIVE = {
  NODE_ENV: "production",
  BETTER_AUTH_URL: "https://www.example.org",
  BETTER_AUTH_SECRET: "a-real-looking-secret-of-sufficient-length-0123456789",
  DATABASE_URL: "mysql://site:a-real-password@127.0.0.1:3306/site_db",
  SMTP_HOST: "smtp.example.org",
  SMTP_USER: "mailer@example.org",
  SMTP_PASS: "app-password",
  SMTP_FROM: "Site <mailer@example.org>",
} as const;
const env = (extra: Record<string, string | undefined> = {}) => ({ ...LIVE, ...extra }) as unknown as NodeJS.ProcessEnv;

describe("v6.1 §5 production environment guard", () => {
  it("accepts a clean live configuration, including a database on 127.0.0.1 (Hostinger)", () => {
    expect(productionGuardProblems(env())).toEqual([]);
  });

  it.each([
    ["NODE_TLS_REJECT_UNAUTHORIZED=0", { NODE_TLS_REJECT_UNAUTHORIZED: "0" }, "NODE_TLS_REJECT_UNAUTHORIZED"],
    ["a test-only secret", { BETTER_AUTH_SECRET: "test-only-secret-not-used-anywhere-else-0123456789" }, "BETTER_AUTH_SECRET"],
    ["a harness-only secret", { BETTER_AUTH_SECRET: "harness-only-secret-not-used-anywhere-0123456789" }, "BETTER_AUTH_SECRET"],
    ["local-development database credentials", { DATABASE_URL: "mysql://nltag:nltag-local-dev-only@127.0.0.1:3306/nltag" }, "DATABASE_URL"],
    ["CI database credentials", { DATABASE_URL: "mysql://nltag:ci-only-password@127.0.0.1:3306/nltag_dev" }, "DATABASE_URL"],
    ["a loopback SMTP host", { SMTP_HOST: "127.0.0.1" }, "SMTP_HOST"],
    ["localhost as SMTP host", { SMTP_HOST: "localhost" }, "SMTP_HOST"],
    ["harness SMTP user", { SMTP_USER: "harness" }, "SMTP_USER"],
    ["harness SMTP password", { SMTP_PASS: "harness" }, "SMTP_PASS"],
  ])("refuses %s on the live site, naming only the variable", (_label, extra, name) => {
    const problems = productionGuardProblems(env(extra));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(new RegExp(`^${name}:`));
    for (const v of Object.values(extra)) if (v && v.length > 8) expect(problems[0]).not.toContain(v);
  });

  it("is inactive outside production and for loopback or non-https site URLs (tests, CI, the harness)", () => {
    const harness = {
      NODE_TLS_REJECT_UNAUTHORIZED: "0",
      BETTER_AUTH_SECRET: "harness-only-secret-not-used-anywhere-0123456789",
      DATABASE_URL: "mysql://nltag:nltag-local-dev-only@127.0.0.1:3306/nltag_v6_test",
      SMTP_HOST: "127.0.0.1",
      SMTP_USER: "harness",
      SMTP_PASS: "harness",
    };
    expect(productionGuardProblems(env({ ...harness, BETTER_AUTH_URL: "http://localhost:3101" }))).toEqual([]);
    expect(productionGuardProblems(env({ ...harness, BETTER_AUTH_URL: "https://localhost:3101" }))).toEqual([]);
    expect(productionGuardProblems(env({ ...harness, BETTER_AUTH_URL: "https://127.0.0.1" }))).toEqual([]);
    expect(productionGuardProblems(env({ ...harness, NODE_ENV: "test" }))).toEqual([]);
    expect(productionGuardProblems(env({ ...harness, NODE_ENV: "development" }))).toEqual([]);
  });

  describe("serverEnv() fails startup", () => {
    const saved = { ...process.env };
    afterEach(() => {
      for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
      Object.assign(process.env, saved);
      resetServerEnvForTests();
    });

    it("throws for a live site with a harness value, without printing the value", () => {
      Object.assign(process.env, LIVE, { SMTP_PASS: "harness" });
      resetServerEnvForTests();
      expect(() => serverEnv()).toThrow(/SMTP_PASS: harness credentials/);
    });

    it("starts normally with a clean live configuration", () => {
      Object.assign(process.env, LIVE);
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      resetServerEnvForTests();
      expect(serverEnv().BETTER_AUTH_URL).toBe(LIVE.BETTER_AUTH_URL);
    });
  });
});

describe("v6.1 §5 SMTP transport TLS", () => {
  const base = { ...LIVE, NODE_ENV: "production", EMAIL_DAILY_CAP: 300, AUTH_RATE_LIMIT: "on" } as never;

  it("always verifies the mail server's certificate (explicit rejectUnauthorized: true, TLS 1.2+)", () => {
    expect(smtpOptions(base).tls).toEqual({ minVersion: "TLSv1.2", rejectUnauthorized: true });
  });

  it("keeps verification on even when the process sets NODE_TLS_REJECT_UNAUTHORIZED=0", () => {
    const saved = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    try {
      expect(smtpOptions(base).tls.rejectUnauthorized).toBe(true);
    } finally {
      if (saved === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      else process.env.NODE_TLS_REJECT_UNAUTHORIZED = saved;
    }
  });

  it("uses implicit TLS on 465 and required STARTTLS otherwise (never plain)", () => {
    expect(smtpOptions(base)).toMatchObject({ port: 465, secure: true, requireTLS: false });
    expect(smtpOptions({ ...(base as object), SMTP_PORT: 587 } as never)).toMatchObject({ port: 587, secure: false, requireTLS: true });
  });
});

describe("v6.1 §2.3 SMTP retry classification", () => {
  const err = (props: Record<string, unknown>) => Object.assign(new Error("x"), props);

  it("retries 3 attempts at 0 s, 5 s, 30 s", () => {
    expect(SMTP_RETRY_DELAYS_MS).toEqual([0, 5000, 30000]);
  });

  it("retries only connection-level failures the server never answered", () => {
    for (const code of ["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS", "ECONNRESET", "ECONNREFUSED"]) expect(isTransientMailError(err({ code })), code).toBe(true);
  });

  it("never retries a server reply (any 4xx or 5xx), authentication errors or unknown errors", () => {
    for (const responseCode of [421, 450, 451, 452, 454, 535, 550, 554]) expect(isTransientMailError(err({ code: "EENVELOPE", responseCode })), String(responseCode)).toBe(false);
    expect(isTransientMailError(err({ code: "ECONNECTION", responseCode: 421 }))).toBe(false);
    expect(isTransientMailError(err({ code: "EAUTH", responseCode: 535 }))).toBe(false);
    expect(isTransientMailError(err({ code: "EAUTH" }))).toBe(false);
    expect(isTransientMailError(new Error("SMTP down"))).toBe(false);
    expect(isTransientMailError(undefined)).toBe(false);
  });
});

describe("v6.1 §2.4 graceful drain", () => {
  afterEach(() => resetLifecycleForTests());

  it("stops new background work and waits for queued work", async () => {
    let finish!: () => void;
    const job = new Promise<void>((r) => (finish = r));
    registerDrainWaiter("test-queue", () => job);
    expect(isDraining()).toBe(false);
    const result = drain(1000);
    expect(isDraining()).toBe(true);
    finish();
    expect(await result).toBe("drained");
    registerDrainWaiter("test-queue", async () => undefined);
  });

  it("gives up after the timeout instead of hanging shutdown", async () => {
    registerDrainWaiter("test-queue", () => new Promise<void>(() => undefined));
    const t0 = performance.now();
    expect(await drain(50)).toBe("timeout");
    expect(performance.now() - t0).toBeLessThan(1000);
    registerDrainWaiter("test-queue", async () => undefined);
  });
});
