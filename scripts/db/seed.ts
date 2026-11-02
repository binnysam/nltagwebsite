// Fictional development data only (architecture §6.5). Never real church members.
//   npm run db:seed
// Refuses to run with NODE_ENV=production or against a database that is not on this machine.
// Accounts use the reserved .test domain, so no email can ever reach a real inbox.
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "../../src/server/db/client";
import { account, staffRole, user, type StaffRole } from "../../src/server/db/schema";
import { serverEnv } from "../../src/server/env";

export const SEED_PASSWORD = "nltag-dev-only-password"; // fictional, local only

export const SEED_USERS: ReadonlyArray<{ name: string; email: string; verified: boolean; roles: StaffRole[] }> = [
  { name: "Test Admin A", email: "admin.a@nltag.test", verified: true, roles: ["CHURCH_ADMIN"] },
  { name: "Test Editor B", email: "editor.b@nltag.test", verified: true, roles: ["CONTENT_EDITOR"] },
  { name: "Test Member C", email: "member.c@nltag.test", verified: true, roles: [] },
  { name: "Test Unverified D", email: "unverified.d@nltag.test", verified: false, roles: [] },
];

export function assertSeedAllowed() {
  const env = serverEnv();
  if (env.NODE_ENV === "production") throw new Error("Seed refused: NODE_ENV=production");
  const host = new URL(env.DATABASE_URL).hostname;
  if (!["127.0.0.1", "localhost", "::1", "mariadb"].includes(host)) throw new Error(`Seed refused: database host ${host} is not local`);
}

export async function seed() {
  assertSeedAllowed();
  const db = getDb();
  const hash = await hashPassword(SEED_PASSWORD);
  const now = new Date();
  for (const u of SEED_USERS) {
    const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, u.email));
    if (existing) continue;
    const id = randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(user).values({ id, name: u.name, email: u.email, emailVerified: u.verified, createdAt: now, updatedAt: now });
      await tx.insert(account).values({ id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: hash, createdAt: now, updatedAt: now });
      for (const role of u.roles) await tx.insert(staffRole).values({ userId: id, role, grantedByUserId: null, grantedAt: now });
    });
  }
}

if (process.argv[1]?.endsWith("seed.ts")) {
  try {
    await seed();
    console.info(`Seeded ${SEED_USERS.length} fictional accounts (@nltag.test). Password: see SEED_PASSWORD in scripts/db/seed.ts.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Seed failed");
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}
