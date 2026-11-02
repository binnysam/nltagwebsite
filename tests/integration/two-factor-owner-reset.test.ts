import { readFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import mysql from "mysql2/promise";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getCurrentUser, mustEnrollTwoFactor, requirePermission } from "@/server/auth/session";
import { closeDb, getDb } from "@/server/db/client";
import { auditLog, session, staffRole, twoFactor, user } from "@/server/db/schema";
import { clearRateLimits, enrollTwoFactor, headersWith, signIn, verifiedUser } from "./helpers";

/**
 * Runbook § 11 D (docs/operations/admin-activation.md): the owner-approved database reset for a
 * person who lost both the authenticator and the recovery codes. The SQL is read from the runbook
 * itself and run exactly as the owner would paste it into phpMyAdmin, so the document cannot drift
 * from what is tested. Owner decision (2 Nov 2026): no automatic bypass; explicit owner approval
 * and an audit row. Fictional @nltag.test accounts only.
 */
const PASSWORD = "correct-horse-battery";
const RUNBOOK = new URL("../../docs/operations/admin-activation.md", import.meta.url);

function resetSql(address: string): string {
  const md = readFileSync(RUNBOOK, "utf8");
  const section = md.slice(md.indexOf("**D. Phone and recovery codes both lost"), md.indexOf("**E. Forgotten password.**"));
  const block = /```sql\n([\s\S]*?)```/.exec(section);
  if (!block) throw new Error("runbook § 11 D has no SQL block");
  const text = block[1]!;
  expect(text.match(/person@example\.org/g)).toHaveLength(1);
  return text.replace("person@example.org", address);
}

async function runAsOwner(sqlText: string) {
  const conn = await mysql.createConnection({ uri: process.env.DATABASE_URL!, multipleStatements: true });
  try {
    const [results] = await conn.query(sqlText);
    const sets = (results as unknown[]).filter(Array.isArray) as Record<string, unknown>[][];
    return sets.at(-1)![0]!;
  } finally {
    await conn.end();
  }
}

afterAll(closeDb);
beforeEach(clearRateLimits);

describe("runbook § 11 D — owner-approved reset of a lost authenticator", () => {
  it("removes the authenticator and recovery codes, signs the person out, writes an audit row, and the admin stays closed until re-enrollment", async () => {
    const address = `reset.admin.${Date.now()}@nltag.test`;
    const first = await verifiedUser(address, PASSWORD);
    const { cookie } = await enrollTwoFactor(first, PASSWORD);
    const [{ id }] = (await getDb().select({ id: user.id }).from(user).where(eq(user.email, address))) as [{ id: string }];
    await getDb().insert(staffRole).values({ userId: id, role: "CHURCH_ADMIN", grantedByUserId: null, grantedAt: new Date() });
    await expect(requirePermission(headersWith(cookie), "admin.access")).resolves.toBeTruthy();

    const out = await runAsOwner(resetSql(address));
    expect(out.reset_user_id).toBe(id);
    expect(Number(out.sessions_removed)).toBeGreaterThan(0);

    expect(await getDb().select().from(twoFactor).where(eq(twoFactor.userId, id))).toHaveLength(0);
    const [u] = await getDb().select({ on: user.twoFactorEnabled }).from(user).where(eq(user.id, id));
    expect(u!.on).toBe(false);
    expect(await getDb().select().from(session).where(eq(session.userId, id))).toHaveLength(0);
    expect(await getCurrentUser(headersWith(cookie))).toBeNull();

    const rows = await getDb().select().from(auditLog).where(and(eq(auditLog.action, "auth.2fa.reset_by_owner"), eq(auditLog.entityId, id)));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.outcome).toBe("SUCCESS");
    expect(rows[0]!.actorUserId).toBeNull();
    expect(rows[0]!.reason).not.toContain("@");

    // Role kept, but it grants nothing until two-factor is set up again (no bypass).
    expect(await getDb().select().from(staffRole).where(eq(staffRole.userId, id))).toHaveLength(1);
    // Password alone now gives a session (no code asked), but the admin role is inert until
    // the person enrolls again; requireStaffPage sends them to the setup page.
    const { res, cookie: again } = await signIn(address, PASSWORD);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { twoFactorRedirect?: boolean }).twoFactorRedirect).toBeFalsy();
    await expect(requirePermission(headersWith(again), "admin.access")).rejects.toMatchObject({ status: 403 });
    const me = await getCurrentUser(headersWith(again));
    expect(me && mustEnrollTwoFactor(me)).toBe(true);
  });

  it("changes nothing and writes no audit row when the address does not match", async () => {
    const before = (await getDb().select().from(auditLog).where(eq(auditLog.action, "auth.2fa.reset_by_owner"))).length;
    const out = await runAsOwner(resetSql("nobody.matches@nltag.test"));
    expect(out.reset_user_id).toBeNull();
    expect((await getDb().select().from(auditLog).where(eq(auditLog.action, "auth.2fa.reset_by_owner"))).length).toBe(before);
  });
});
