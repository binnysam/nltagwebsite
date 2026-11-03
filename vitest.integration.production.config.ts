import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * L4 (PR #11 review): the fail-closed behaviour checked with NODE_ENV=production. Better Auth
 * decides between its test fallback (127.0.0.1) and the production key (no-trusted-ip) when it is
 * first imported, so this needs its own run. Same local/CI MariaDB as the integration suite.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration-production/**/*.test.ts"],
    globalSetup: ["./tests/integration/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: "production",
      // Vitest sets TEST=true, which Better Auth also reads as test mode (its 127.0.0.1 fallback).
      TEST: "false",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "mysql://nltag:nltag-local-dev-only@127.0.0.1:3306/nltag_test",
      BETTER_AUTH_SECRET: "test-only-secret-not-used-anywhere-else-0123456789",
      BETTER_AUTH_URL: "http://localhost:3000",
      AUTH_RATE_LIMIT: "on",
      // The production default: resolution off until the header capture has been reviewed.
      CLIENT_IP_SOURCE: "",
      CLIENT_IP_SHAPE_LOG: "off",
      EMAIL_DAILY_CAP: "300",
    },
  },
});
