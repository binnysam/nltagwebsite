// Applies the reviewed SQL files in drizzle/ to DATABASE_URL.
//   npm run db:migrate            local and CI
//   npm run staging:migrate       staging only (NLTAG_DEPLOYMENT=staging), after the live check
// Production migrations are a separate, owner-approved step (architecture §12):
// take a dump first, then run with NLTAG_APPROVED_PRODUCTION_MIGRATION=1.
import { migrate } from "drizzle-orm/mysql2/migrator";
import { closeDb, getDb } from "../../src/server/db/client";
import { isStaging } from "../../src/server/deployment/environment";
import { verifyDeployment } from "../../src/server/deployment/verify";
import { serverEnv } from "../../src/server/env";
import { migrationTargetProblems } from "../../src/server/deployment/migration-target";

const env = serverEnv();
const target = migrationTargetProblems(process.env, process.argv.includes("--staging"));
if (target.length) {
  console.error(`Refusing to migrate: ${target.join("; ")}`);
  process.exit(1);
}
if (isStaging()) {
  // The server must confirm it is the staging database (marker row) before any DDL runs.
  const state = await verifyDeployment(process.env, { claimDatabaseIfEmpty: process.argv.includes("--init") });
  if (state.status !== "verified") {
    console.error(`Refusing to migrate staging: ${state.status === "failed" ? state.problems.join("; ") : "not verified"}`);
    process.exit(1);
  }
  console.info("Staging database verified (name and marker).");
}
const host = new URL(env.DATABASE_URL).hostname;
console.info(`Migrating database on ${host}…`);
await migrate(getDb(), { migrationsFolder: "./drizzle" });
console.info("Migrations applied.");
await closeDb();
