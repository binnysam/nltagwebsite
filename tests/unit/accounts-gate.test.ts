// @vitest-environment node
import { describe, expect, it } from "vitest";
import { accountsEnabled } from "@/server/accounts-gate";

const SMTP = { SMTP_HOST: "smtp.example.test", SMTP_USER: "u", SMTP_PASS: "p", SMTP_FROM: "NLTAG <u@example.test>" };
const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;

describe("accounts gate (owner decision 2 Nov 2026)", () => {
  it("is off by default, in every environment", () => {
    expect(accountsEnabled(env({ NODE_ENV: "production" }))).toBe(false);
    expect(accountsEnabled(env({ NODE_ENV: "development" }))).toBe(false);
    expect(accountsEnabled(env({ NODE_ENV: "production", ...SMTP }))).toBe(false);
  });

  it("accepts only the exact value 1", () => {
    for (const v of ["0", "true", "yes", "", "on"]) {
      expect(accountsEnabled(env({ NODE_ENV: "production", NLTAG_ACCOUNTS_ENABLED: v, ...SMTP }))).toBe(false);
    }
  });

  it("stays off in production while any SMTP variable is missing or blank", () => {
    for (const key of Object.keys(SMTP)) {
      const partial: Record<string, string> = { NODE_ENV: "production", NLTAG_ACCOUNTS_ENABLED: "1", ...SMTP };
      delete partial[key];
      expect(accountsEnabled(env(partial))).toBe(false);
      expect(accountsEnabled(env({ ...partial, [key]: "  " }))).toBe(false);
    }
  });

  it("turns on in production only with the flag and full SMTP", () => {
    expect(accountsEnabled(env({ NODE_ENV: "production", NLTAG_ACCOUNTS_ENABLED: "1", ...SMTP }))).toBe(true);
  });

  it("turns on locally with the flag alone (development mail goes to the local outbox)", () => {
    expect(accountsEnabled(env({ NODE_ENV: "development", NLTAG_ACCOUNTS_ENABLED: "1" }))).toBe(true);
  });
});
