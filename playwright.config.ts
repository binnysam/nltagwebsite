import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  // Database-backed auth runs (E2E_AUTH=1: admin, two-factor, auth) use one worker, so the phone and
  // desktop projects never sign in the same seeded Church Admin at the same moment. Concurrent
  // two-factor verifies can deadlock in MariaDB 11.8.9 on Better Auth's `verification` cleanup
  // (PR #12, M1). Other suites keep Playwright's default.
  workers: process.env.E2E_AUTH === "1" ? 1 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    launchOptions: process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
  },
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled" } },
  projects: [
    { name: "phone-390", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true } },
    { name: "desktop-1280", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
  ],
  webServer: {
    // The gallery only exists where this flag is set at build AND at start (pages render per request
    // since the staging banner reads the environment in the root layout). Never set it in production.
    command: `NLTAG_DESIGN_SYSTEM_GALLERY=1 npx next build && NLTAG_DESIGN_SYSTEM_GALLERY=1 npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/ta`,
    reuseExistingServer: true,
    timeout: 240_000,
  },
});
