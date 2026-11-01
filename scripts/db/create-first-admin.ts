// One-time command to make the first Church Admin (architecture §5).
//   npm run admin:bootstrap -- someone@example.org
// The account must already exist and have a verified email. Refuses if any Church Admin exists.
// Later admins are added by an existing admin through the admin screen (audited).
import { closeDb } from "../../src/server/db/client";
import { bootstrapFirstAdmin, RoleError } from "../../src/server/services/roles";

const email = process.argv[2];
if (!email) {
  console.error("Usage: npm run admin:bootstrap -- <verified account email>");
  process.exit(1);
}
try {
  const id = await bootstrapFirstAdmin(email);
  console.info(`Church Admin role granted to user ${id}.`);
} catch (error) {
  console.error(error instanceof RoleError ? `Not done: ${error.message}` : "Not done: unexpected error.");
  process.exitCode = 1;
} finally {
  await closeDb();
}
