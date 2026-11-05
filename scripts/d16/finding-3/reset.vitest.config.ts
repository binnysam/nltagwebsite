import { defineConfig } from "vitest/config";
import integration from "../../../vitest.integration.config.ts";
// Reset-request timing probe only (scripts/d16/finding-3/reset-run.sh); `include` is replaced, never the suite.
export default defineConfig({ ...integration, test: { ...integration.test, include: ["scripts/d16/finding-3/reset-timing.probe.ts"] } });
