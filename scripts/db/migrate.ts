// Applies the reviewed SQL files in drizzle/ to DATABASE_URL.
//   npm run db:migrate
// Local and CI only. Production migrations are a separate, owner-approved step (architecture §12):
// take a dump first, then run with NLTAG_APPROVED_PRODUCTION_MIGRATION=1.
import { migrate } from "drizzle-orm/mysql2/migrator";
import { closeDb, getDb } from "../../src/server/db/client";
import { serverEnv } from "../../src/server/env";

const env = serverEnv();
if (env.NODE_ENV === "production" && process.env.NLTAG_APPROVED_PRODUCTION_MIGRATION !== "1") {
  console.error("Refusing to migrate a production database without NLTAG_APPROVED_PRODUCTION_MIGRATION=1 (owner approval required).");
  process.exit(1);
}
const host = new URL(env.DATABASE_URL).hostname;
console.info(`Migrating database on ${host}…`);
await migrate(getDb(), { migrationsFolder: "./drizzle" });
console.info("Migrations applied.");
await closeDb();
