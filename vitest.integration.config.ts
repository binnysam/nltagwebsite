import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Integration and security tests against a real MariaDB (local: Ubuntu MariaDB or a container;
 * CI: the mariadb:11.8 service). Uses its own database, which globalSetup empties and migrates.
 *   TEST_DATABASE_URL=mysql://user:pass@127.0.0.1:3306/nltag_test npm run test:integration
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
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["./tests/integration/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "mysql://nltag:nltag-local-dev-only@127.0.0.1:3306/nltag_test",
      BETTER_AUTH_SECRET: "test-only-secret-not-used-anywhere-else-0123456789",
      BETTER_AUTH_URL: "http://localhost:3000",
      AUTH_RATE_LIMIT: "on",
      // The route returns 404 without it (src/server/accounts-gate.ts); tests go through the route.
      NLTAG_ACCOUNTS_ENABLED: "1",
      // The layout Hostinger documents for its CDN (docs/backend/client-ip.md).
      CLIENT_IP_SOURCE: "forwarded-chain",
      CLIENT_IP_PROXY_HOPS: "0",
      CLIENT_IP_CROSSCHECK: "x-real-ip",
      CLIENT_IP_SHAPE_LOG: "off",
      EMAIL_DAILY_CAP: "300",
    },
  },
});
