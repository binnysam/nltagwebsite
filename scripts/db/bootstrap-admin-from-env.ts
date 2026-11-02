// Hostinger build step (Phase 6a): grants the first Church Admin once, only when the owner has
// set NLTAG_BOOTSTRAP_ADMIN_EMAIL for this one build. See src/server/services/env-bootstrap.ts
// and docs/operations/admin-activation.md. Prints one line, never the address or user id.
// Always exits 0 so a refused bootstrap never blocks a deploy; the line says what happened.
import { closeDb } from "../../src/server/db/client";
import { runEnvBootstrap } from "../../src/server/services/env-bootstrap";
import { bootstrapFirstAdmin, RoleError } from "../../src/server/services/roles";

const reasonOf = (error: unknown) =>
  error instanceof RoleError
    ? error.code === "ALREADY_BOOTSTRAPPED"
      ? "a Church Admin already exists (nothing to do; remove NLTAG_BOOTSTRAP_ADMIN_EMAIL)."
      : error.code === "NOT_FOUND"
        ? "no account with that address yet. Sign up and verify the email first."
        : error.code === "UNVERIFIED"
          ? "the account's email is not verified yet."
          : "refused by the role rules."
    : "unexpected error (database unreachable?).";

try {
  const { message } = await runEnvBootstrap(process.env, { bootstrap: bootstrapFirstAdmin, reasonOf });
  console.info(message);
} finally {
  await closeDb();
}
