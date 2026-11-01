import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getCurrentUser, requirePermission, AuthzError } from "@/server/auth/session";
import { closeDb, getDb } from "@/server/db/client";
import { auditLog, session, staffRole, user } from "@/server/db/schema";
import { bootstrapFirstAdmin, grantRole, revokeRole, rolesOf } from "@/server/services/roles";
import { seed, SEED_PASSWORD, SEED_USERS } from "../../scripts/db/seed";
import { clearRateLimits, headersWith, signIn } from "./helpers";

const [ADMIN, EDITOR, MEMBER, UNVERIFIED] = SEED_USERS.map((u) => u.email) as [string, string, string, string];
const cookies: Record<string, string> = {};

async function idOf(email: string) {
  const [u] = await getDb().select({ id: user.id }).from(user).where(eq(user.email, email));
  return u!.id;
}

beforeAll(async () => {
  await seed();
  await clearRateLimits();
  for (const email of [ADMIN, EDITOR, MEMBER]) {
    const { res, cookie } = await signIn(email, SEED_PASSWORD);
    expect(res.status).toBe(200);
    cookies[email] = cookie;
  }
});
beforeEach(clearRateLimits);
afterAll(closeDb);

describe("server-side permission checks", () => {
  it("visitor (no session) gets 401 for any protected permission", async () => {
    await expect(requirePermission(new Headers(), "account.manage_own")).rejects.toMatchObject({ status: 401 });
  });

  it("member can manage their own account but cannot reach admin areas", async () => {
    const h = headersWith(cookies[MEMBER]!);
    await expect(requirePermission(h, "account.manage_own")).resolves.toMatchObject({ principal: { roles: [] } });
    for (const p of ["admin.access", "content.draft.edit", "membership.read_any", "staff.manage", "audit.read"] as const) {
      await expect(requirePermission(h, p)).rejects.toMatchObject({ status: 403 });
    }
  });

  it("Content Editor can edit drafts but cannot publish or touch membership, users or audit", async () => {
    const h = headersWith(cookies[EDITOR]!);
    await expect(requirePermission(h, "content.draft.edit")).resolves.toBeTruthy();
    await expect(requirePermission(h, "media.upload")).resolves.toBeTruthy();
    for (const p of ["content.publish", "membership.read_any", "membership.decide", "membership.export", "membership.birthdays", "staff.manage", "audit.read"] as const) {
      await expect(requirePermission(h, p)).rejects.toBeInstanceOf(AuthzError);
    }
  });

  it("can hide a forbidden resource as 404", async () => {
    await expect(requirePermission(headersWith(cookies[EDITOR]!), "membership.read_any", { hideAs404: true })).rejects.toMatchObject({ status: 404 });
  });

  it("Church Admin has every staff permission", async () => {
    const h = headersWith(cookies[ADMIN]!);
    for (const p of ["admin.access", "content.publish", "membership.read_any", "membership.export", "staff.manage", "audit.read"] as const) {
      await expect(requirePermission(h, p)).resolves.toBeTruthy();
    }
  });

  it("audits every denial with the permission name and no personal data", async () => {
    const rows = await getDb().select().from(auditLog).where(eq(auditLog.action, "policy.deny"));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.reason === "membership.read_any" && r.actorUserId === null)).toBe(false);
    expect(JSON.stringify(rows)).not.toMatch(/@/);
  });

  it("ignores roles claimed by the client: roles only come from the database", async () => {
    const h = headersWith(cookies[MEMBER]!);
    h.set("x-role", "CHURCH_ADMIN");
    h.append("cookie", "; role=CHURCH_ADMIN");
    await expect(requirePermission(h, "staff.manage")).rejects.toMatchObject({ status: 403 });
  });

  it("an unverified account cannot sign in at all", async () => {
    const { res } = await signIn(UNVERIFIED, SEED_PASSWORD);
    expect(res.status).toBe(403);
  });
});

describe("staff sessions", () => {
  it("ends a staff session older than 12 hours and audits it", async () => {
    const { cookie } = await signIn(EDITOR, SEED_PASSWORD);
    const editorId = await idOf(EDITOR);
    const thirteenHoursAgo = new Date(Date.now() - 13 * 3600 * 1000);
    const [latest] = await getDb().select().from(session).where(eq(session.userId, editorId)).orderBy(sql`created_at DESC`).limit(1);
    await getDb().update(session).set({ createdAt: thirteenHoursAgo }).where(eq(session.id, latest!.id));
    expect(await getCurrentUser(headersWith(cookie))).toBeNull();
    const [gone] = await getDb().select().from(session).where(eq(session.id, latest!.id));
    expect(gone).toBeUndefined();
    const audits = await getDb().select().from(auditLog).where(eq(auditLog.action, "auth.staff_session.expire"));
    expect(audits.length).toBe(1);
  });

  it("keeps a member session of the same age (members get 7 days)", async () => {
    const { cookie } = await signIn(MEMBER, SEED_PASSWORD);
    const memberId = await idOf(MEMBER);
    const [latest] = await getDb().select().from(session).where(eq(session.userId, memberId)).orderBy(sql`created_at DESC`).limit(1);
    await getDb().update(session).set({ createdAt: new Date(Date.now() - 13 * 3600 * 1000) }).where(eq(session.id, latest!.id));
    expect(await getCurrentUser(headersWith(cookie))).not.toBeNull();
  });

  it("a revoked role stops working on the very next request", async () => {
    const adminId = await idOf(ADMIN);
    const memberId = await idOf(MEMBER);
    const { cookie } = await signIn(MEMBER, SEED_PASSWORD);
    await grantRole(adminId, memberId, "CONTENT_EDITOR");
    await expect(requirePermission(headersWith(cookie), "content.draft.edit")).resolves.toBeTruthy();
    await revokeRole(adminId, memberId, "CONTENT_EDITOR");
    await expect(requirePermission(headersWith(cookie), "content.draft.edit")).rejects.toMatchObject({ status: 403 });
  });
});

describe("role management", () => {
  it("bootstrap refuses when a Church Admin already exists", async () => {
    await expect(bootstrapFirstAdmin(MEMBER)).rejects.toMatchObject({ code: "ALREADY_BOOTSTRAPPED" });
  });

  it("nobody can change their own roles", async () => {
    const adminId = await idOf(ADMIN);
    await expect(grantRole(adminId, adminId, "CONTENT_EDITOR")).rejects.toMatchObject({ code: "SELF_CHANGE" });
  });

  it("roles can only be granted to verified accounts", async () => {
    await expect(grantRole(await idOf(ADMIN), await idOf(UNVERIFIED), "CONTENT_EDITOR")).rejects.toMatchObject({ code: "UNVERIFIED" });
  });

  it("the last Church Admin cannot be removed", async () => {
    const adminId = await idOf(ADMIN);
    const editorId = await idOf(EDITOR);
    await grantRole(adminId, editorId, "CHURCH_ADMIN"); // two admins
    await revokeRole(editorId, adminId, "CHURCH_ADMIN"); // one admin left: the editor
    await expect(revokeRole(adminId, editorId, "CHURCH_ADMIN")).rejects.toMatchObject({ code: "LAST_ADMIN" });
    const admins = await getDb().select().from(staffRole).where(eq(staffRole.role, "CHURCH_ADMIN"));
    expect(admins.map((r) => r.userId)).toEqual([editorId]);
    await grantRole(editorId, adminId, "CHURCH_ADMIN"); // restore
  });

  it("writes an audit row for every grant and revoke", async () => {
    const rows = await getDb().select().from(auditLog).where(sql`${auditLog.action} IN ('role.grant', 'role.revoke')`);
    expect(rows.length).toBeGreaterThanOrEqual(4);
    expect(rows.every((r) => r.actorUserId && r.entityId && r.reason)).toBe(true);
  });

  it("first-admin bootstrap works on an empty role table and only once", async () => {
    await getDb().delete(staffRole);
    await bootstrapFirstAdmin(MEMBER);
    expect(await rolesOf(await idOf(MEMBER))).toEqual(["CHURCH_ADMIN"]);
    await expect(bootstrapFirstAdmin(EDITOR)).rejects.toMatchObject({ code: "ALREADY_BOOTSTRAPPED" });
  });
});
