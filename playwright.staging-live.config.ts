import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/**
 * Live staging runs (https://staging.nltagkuwait.com): the same projects and expectations as
 * playwright.config.ts, but no local web server is built or started.
 *   STAGING_E2E=1 STAGING_BASE_URL=https://staging.nltagkuwait.com \
 *   npx playwright test --config playwright.staging-live.config.ts staging-live staging
 */
export default defineConfig({ ...base, webServer: undefined, use: { ...base.use, baseURL: process.env.STAGING_BASE_URL ?? "https://staging.nltagkuwait.com" } });
