import { getDb } from "../db/client";
import { auditLog, type AuditOutcome } from "../db/schema";
import { hashIp } from "../security/hash";
import { log } from "../security/log";

/**
 * Audit action names. Dotted, lower case, no personal data. Add new ones here so they stay
 * discoverable (Phase 4c/4d add content.* and application.*).
 */
export const AUDIT_ACTIONS = [
  "auth.user.create",
  "auth.email.verify",
  "auth.session.create",
  "auth.session.revoke",
  "auth.sign_in.fail",
  "auth.password.reset",
  "auth.password.change",
  "auth.staff_session.expire",
  "email.send",
  "email.suppress",
  "email.fail",
  "role.grant",
  "role.revoke",
  "role.bootstrap",
  "policy.deny",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEntry {
  actorUserId?: string | null;
  action: AuditAction;
  outcome?: AuditOutcome;
  entity?: string | null;
  entityId?: string | null;
  ip?: string | null;
  /** Short reason. Never personal data. */
  reason?: string | null;
}

/**
 * Writes one audit row. Audit failures are logged but never block the user's action, except
 * where a caller passes `required: true` (exports, role changes), in which case it throws so the
 * surrounding transaction rolls back.
 */
export async function audit(entry: AuditEntry, opts: { required?: boolean; db?: Pick<ReturnType<typeof getDb>, "insert"> } = {}) {
  const row = {
    actorUserId: entry.actorUserId ?? null,
    action: entry.action,
    outcome: entry.outcome ?? "SUCCESS",
    entity: entry.entity ?? null,
    entityId: entry.entityId ?? null,
    ipHash: hashIp(entry.ip),
    reason: entry.reason ? entry.reason.slice(0, 500) : null,
    createdAt: new Date(),
  } as const;
  try {
    await (opts.db ?? getDb()).insert(auditLog).values(row);
  } catch (error) {
    log("error", "audit.write_failed", { action: entry.action, error });
    if (opts.required) throw error;
  }
}
