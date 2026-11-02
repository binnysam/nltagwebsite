import { defineConfig } from "drizzle-kit";

/**
 * Migrations workflow (Phase 4a decision, MariaDB 11.8):
 *   1. change src/server/db/schema/*
 *   2. npm run db:generate -- --name <what_changed>   → new SQL file in drizzle/
 *   3. read and edit the SQL by hand if needed; commit it with the schema change
 *   4. npm run db:migrate (local/CI only; production needs owner approval)
 * Never use `drizzle-kit push` or `introspect`: they have MariaDB quirks and skip review.
 */
export default defineConfig({
  dialect: "mysql",
  schema: "./src/server/db/schema/index.ts",
  out: "./drizzle",
  strict: true,
  verbose: true,
});
