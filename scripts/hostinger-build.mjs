// Hostinger build entry point (build script "build:hostinger").
// The deployment has no SSH step, so owner-approved one-off server tasks run here, each only when
// its variable is set in the Hostinger environment for one build and removed straight after:
//
//   NLTAG_APPROVED_PRODUCTION_MIGRATION=1   apply the reviewed SQL migrations in drizzle/ to
//                                           DATABASE_URL (MariaDB on 127.0.0.1) before `next build`.
//   NLTAG_BOOTSTRAP_ADMIN_EMAIL=<address>   after a successful `next build`, grant the first Church
//                                           Admin (scripts/db/bootstrap-admin-from-env.ts). Prints
//                                           "granted" or "not done: <reason>"; never the address.
//
// The two are refused in the same build. This script never prints values from the environment.
import { spawnSync } from "node:child_process";

function run(cmd, args, env = process.env) {
  const r = spawnSync(cmd, args, { stdio: "inherit", env });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const migration = process.env.NLTAG_APPROVED_PRODUCTION_MIGRATION === "1";
const bootstrap = (process.env.NLTAG_BOOTSTRAP_ADMIN_EMAIL ?? "").trim() !== "";

if (migration && bootstrap) {
  console.error("Refused: a production migration and the admin bootstrap cannot run in the same build. Nothing was done.");
  process.exit(1);
}

if (migration) {
  console.info("Owner-approved production migration requested for this build.");
  run("npm", ["run", "db:migrate"], { ...process.env, NODE_ENV: "production" });
} else {
  console.info("No migration requested (NLTAG_APPROVED_PRODUCTION_MIGRATION not set).");
}
run("npx", ["next", "build"]);

if (bootstrap) {
  console.info("Owner-approved first Church Admin bootstrap requested for this build.");
  run("npm", ["run", "admin:bootstrap:env"], { ...process.env, NODE_ENV: "production" });
} else {
  console.info("No admin bootstrap requested (NLTAG_BOOTSTRAP_ADMIN_EMAIL not set).");
}
