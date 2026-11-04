import { defineConfig } from "vitest/config";
import integration from "../../../vitest.integration.config.ts";

/**
 * D16 finding 3 investigation only (scripts/d16/finding-3/run.sh). Same environment as the
 * integration suite (its env, aliases and globalSetup, which empties and migrates a *_test
 * database), but `include` is REPLACED (not merged) so it runs only the probe file, never the suite.
 */
export default defineConfig({
  ...integration,
  test: { ...integration.test, include: ["scripts/d16/finding-3/allowlist-timing.probe.ts"] },
});
