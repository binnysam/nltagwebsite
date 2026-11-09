// Staging operations (docs/operations/staging.md). Every command first runs the live staging
// check (configuration, database name + marker, media folder marker) and refuses on any problem.
// Prints rule names and outcomes only, never values from the environment.
//
//   npm run staging:verify      check only (exit 1 on any problem)
//   npm run staging:init        claim a NEW, EMPTY staging database (marker row), then migrate
//   npm run staging:migrate     apply drizzle/ migrations to the verified staging database
//   npm run staging:seed        fictional fixtures ([E2E …] records; authors cannot sign in)
//   npm run staging:bootstrap   grant Church Admin to NLTAG_STAGING_BOOTSTRAP_ADMIN_EMAIL
//                               (reserved test address only; staging database only)
import { closeDb } from "../../src/server/db/client";
import { isStaging } from "../../src/server/deployment/environment";
import { verifyDeployment } from "../../src/server/deployment/verify";

const command = process.argv[2] ?? "verify";

async function main(): Promise<number> {
  if (!isStaging()) {
    console.error("Refused: staging commands need NLTAG_DEPLOYMENT=staging.");
    return 1;
  }
  const state = await verifyDeployment(process.env, { claimDatabaseIfEmpty: command === "init" });
  if (state.status !== "verified") {
    console.error(`Staging check failed: ${state.status === "failed" ? state.problems.join("; ") : "not verified"}`);
    return 1;
  }
  console.info("Staging check passed: configuration, database (name and marker), media folder (marker).");
  if (command === "verify" || command === "init") return 0;
  if (command === "seed") {
    const { seed } = await import("../db/seed");
    const { seedPublicFixtures } = await import("../db/seed-public-fixtures");
    await seed();
    const added = await seedPublicFixtures();
    console.info(added === false ? "Staging fixtures already present." : "Staging fixtures added (fictional, [E2E …]).");
    return 0;
  }
  if (command === "bootstrap") {
    const { runEnvBootstrap } = await import("../../src/server/services/env-bootstrap");
    const { bootstrapFirstAdmin } = await import("../../src/server/services/roles");
    const email = (process.env.NLTAG_STAGING_BOOTSTRAP_ADMIN_EMAIL ?? "").trim();
    if (!email) {
      console.info("No staging admin bootstrap requested (NLTAG_STAGING_BOOTSTRAP_ADMIN_EMAIL not set).");
      return 0;
    }
    // Same rules as production (verified account, allowlisted, two-factor on, only the first
    // admin), applied to the verified staging database. The variable is checked to be a reserved
    // test address by the configuration rules above.
    const { message } = await runEnvBootstrap(
      { ...process.env, NLTAG_BOOTSTRAP_ADMIN_EMAIL: email },
      { bootstrap: bootstrapFirstAdmin, reasonOf: () => "refused by the role rules (account missing, unverified or without two-factor?)." },
    );
    console.info(message.replace("NLTAG_BOOTSTRAP_ADMIN_EMAIL", "NLTAG_STAGING_BOOTSTRAP_ADMIN_EMAIL"));
    return 0;
  }
  console.error(`Unknown staging command: ${command}`);
  return 1;
}

let code = 1;
try {
  code = await main();
} catch (e) {
  console.error(`Staging command failed: ${e instanceof Error ? `${e.name}: ${e.message.replace(/mysql:\/\/\S+/g, "[url]")}` : "error"}`);
} finally {
  await closeDb().catch(() => undefined);
}
process.exit(code);
