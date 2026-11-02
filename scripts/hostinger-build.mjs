// Hostinger build entry point (build script "build:hostinger").
// Runs `next build`. Only when NLTAG_APPROVED_PRODUCTION_MIGRATION=1 is set in the Hostinger
// environment (owner-approved, for one build, then removed) does it first apply the reviewed
// SQL migrations in drizzle/ to DATABASE_URL, which on Hostinger is MariaDB on 127.0.0.1.
// This exists because the deployment has no SSH step. It never prints values from the environment.
import { spawnSync } from "node:child_process";

function run(cmd, args, env = process.env) {
  const r = spawnSync(cmd, args, { stdio: "inherit", env });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (process.env.NLTAG_APPROVED_PRODUCTION_MIGRATION === "1") {
  console.info("Owner-approved production migration requested for this build.");
  run("npm", ["run", "db:migrate"], { ...process.env, NODE_ENV: "production" });
} else {
  console.info("No migration requested (NLTAG_APPROVED_PRODUCTION_MIGRATION not set).");
}
run("npx", ["next", "build"]);
