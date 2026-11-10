// Hostinger build entry point (build script "build:hostinger"). Used by BOTH Node.js apps:
//   production  nltagkuwait.com          (branch main, NLTAG_DEPLOYMENT unset)
//   staging     staging.nltagkuwait.com  (branch staging, NLTAG_DEPLOYMENT=staging)
// The deployment has no SSH step, so owner-approved one-off server tasks run here, each only when
// its variable is set in that app's Hostinger environment:
//
// Production (unchanged):
//   NLTAG_APPROVED_PRODUCTION_MIGRATION=1   apply the reviewed SQL migrations in drizzle/ to
//                                           DATABASE_URL (MariaDB on 127.0.0.1) before `next build`.
//   NLTAG_BOOTSTRAP_ADMIN_EMAIL=<address>   after a successful `next build`, grant the first Church
//                                           Admin (scripts/db/bootstrap-admin-from-env.ts). Prints
//                                           "granted" or "not done: <reason>"; never the address.
//   The two are refused in the same build.
//
// Staging (docs/operations/staging.md): the live staging check runs first and the build stops if
// it fails, so a staging build can never touch a database or media folder that is not staging's.
//   NLTAG_STAGING_INIT=1                    first build only: claim the NEW, EMPTY staging database
//                                           (marker row; refused if it already has tables), migrate
//   NLTAG_STAGING_MIGRATE=1                 migrate the verified staging database (every build may)
//   NLTAG_STAGING_SEED=1                    add the fictional [E2E …] fixtures (idempotent)
//   NLTAG_STAGING_BOOTSTRAP_ADMIN_EMAIL     grant Church Admin to a reserved test address
//   The production flags above are refused in a staging build.
//
// This script never prints values from the environment.
import { spawnSync } from "node:child_process";

function run(cmd, args, env = process.env) {
  const r = spawnSync(cmd, args, { stdio: "inherit", env });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const staging = (process.env.NLTAG_DEPLOYMENT ?? "").trim() === "staging";
const migration = process.env.NLTAG_APPROVED_PRODUCTION_MIGRATION === "1";
const bootstrap = (process.env.NLTAG_BOOTSTRAP_ADMIN_EMAIL ?? "").trim() !== "";

if (staging) {
  if (migration || bootstrap) {
    console.error("Refused: production migration and production admin bootstrap flags are not allowed in a staging build. Nothing was done.");
    process.exit(1);
  }
  const env = { ...process.env, NODE_ENV: "production" };
  console.info("Staging build: checking that the database and media folder are staging's own.");
  if (process.env.NLTAG_STAGING_INIT === "1") run("npm", ["run", "staging:init"], env);
  else run("npm", ["run", "staging:verify"], env);
  if (process.env.NLTAG_STAGING_MIGRATE === "1") run("npm", ["run", "staging:migrate"], env);
  else console.info("No staging migration requested (NLTAG_STAGING_MIGRATE not set).");
  if (process.env.NLTAG_STAGING_SEED === "1") run("npm", ["run", "staging:seed"], env);
  run("npx", ["next", "build"]);
  if ((process.env.NLTAG_STAGING_BOOTSTRAP_ADMIN_EMAIL ?? "").trim() !== "") run("npm", ["run", "staging:bootstrap"], env);
  process.exit(0);
}

// NLTAG_PUBLIC_FORMS=staff is a staging-only test mode (src/server/forms/mode.ts): a production
// build with it is refused before anything runs. The server also refuses it at run time.
if ((process.env.NLTAG_PUBLIC_FORMS ?? "").trim() === "staff") {
  console.error("Refused: NLTAG_PUBLIC_FORMS=staff is a staging-only test mode and is not allowed in production. Nothing was done.");
  process.exit(1);
}

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
