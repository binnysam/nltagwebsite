import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { staffRole, user, type StaffRole } from "../db/schema";
import { audit } from "./audit";

export class RoleError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "UNVERIFIED" | "NO_TWO_FACTOR" | "ALREADY_BOOTSTRAPPED" | "LAST_ADMIN" | "SELF_CHANGE",
    message: string,
  ) {
    super(message);
  }
}

export async function rolesOf(userId: string): Promise<StaffRole[]> {
  const rows = await getDb().select({ role: staffRole.role }).from(staffRole).where(eq(staffRole.userId, userId));
  return rows.map((r) => r.role);
}

async function countAdmins(tx: Pick<ReturnType<typeof getDb>, "select">) {
  const [row] = await tx
    .select({ n: sql<number>`COUNT(*)` })
    .from(staffRole)
    .where(eq(staffRole.role, "CHURCH_ADMIN"));
  return Number(row?.n ?? 0);
}

/**
 * One-time creation of the first Church Admin, run on the server by scripts/create-first-admin.ts.
 * Refuses if any Church Admin exists. The account must already exist, be email-verified and
 * (Phase 6b) have a verified authenticator app, so the first admin never holds the role without
 * two-factor.
 * The admin role is never self-assigned through the web app.
 */
export async function bootstrapFirstAdmin(email: string): Promise<string> {
  return getDb().transaction(async (tx) => {
    // Lock the role table range so two concurrent bootstraps cannot both succeed.
    const existing = await tx.select({ id: staffRole.id }).from(staffRole).where(eq(staffRole.role, "CHURCH_ADMIN")).for("update");
    if (existing.length > 0) throw new RoleError("ALREADY_BOOTSTRAPPED", "A Church Admin already exists; add admins from the admin screen.");
    const [u] = await tx.select({ id: user.id, verified: user.emailVerified, twoFactor: user.twoFactorEnabled }).from(user).where(eq(user.email, email.trim()));
    if (!u) throw new RoleError("NOT_FOUND", "No account with that email. Sign up and verify the email first.");
    if (!u.verified) throw new RoleError("UNVERIFIED", "Verify the account's email before making it an admin.");
    if (!u.twoFactor) throw new RoleError("NO_TWO_FACTOR", "Set up the authenticator app (two-factor) on the account before making it an admin.");
    await tx.insert(staffRole).values({ userId: u.id, role: "CHURCH_ADMIN", grantedByUserId: null, grantedAt: new Date() });
    await audit({ actorUserId: null, action: "role.bootstrap", entity: "user", entityId: u.id, reason: "CHURCH_ADMIN" }, { required: true, db: tx });
    return u.id;
  });
}

/**
 * Grant a staff role. Callers must already have checked `staff.manage` through the policy
 * (requirePermission); this function re-checks the target and writes the audit row in the
 * same transaction.
 */
export async function grantRole(actorUserId: string, targetUserId: string, role: StaffRole, ip?: string | null) {
  if (actorUserId === targetUserId) throw new RoleError("SELF_CHANGE", "You cannot change your own roles.");
  await getDb().transaction(async (tx) => {
    const [target] = await tx.select({ verified: user.emailVerified }).from(user).where(eq(user.id, targetUserId));
    if (!target) throw new RoleError("NOT_FOUND", "User not found.");
    if (!target.verified) throw new RoleError("UNVERIFIED", "The user must verify their email first.");
    await tx
      .insert(staffRole)
      .values({ userId: targetUserId, role, grantedByUserId: actorUserId, grantedAt: new Date() })
      .onDuplicateKeyUpdate({ set: { userId: sql`${staffRole.userId}` } });
    await audit({ actorUserId, action: "role.grant", entity: "user", entityId: targetUserId, reason: role, ip }, { required: true, db: tx });
  });
}

export async function revokeRole(actorUserId: string, targetUserId: string, role: StaffRole, ip?: string | null) {
  if (actorUserId === targetUserId) throw new RoleError("SELF_CHANGE", "You cannot change your own roles.");
  await getDb().transaction(async (tx) => {
    if (role === "CHURCH_ADMIN") {
      // Lock admin rows, then make sure at least one admin remains.
      await tx.select({ id: staffRole.id }).from(staffRole).where(eq(staffRole.role, "CHURCH_ADMIN")).for("update");
      if ((await countAdmins(tx)) <= 1) throw new RoleError("LAST_ADMIN", "The last Church Admin cannot be removed.");
    }
    await tx.delete(staffRole).where(and(eq(staffRole.userId, targetUserId), eq(staffRole.role, role)));
    await audit({ actorUserId, action: "role.revoke", entity: "user", entityId: targetUserId, reason: role, ip }, { required: true, db: tx });
  });
}
