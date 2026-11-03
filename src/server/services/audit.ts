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
  // Sign-in refused before the password check because the address is in its progressive delay
  // (any IP). At most one row per address per hour; reason "account" or "recognised-browser".
  "auth.sign_in.throttled",
  "auth.password.reset",
  "auth.password.change",
  "auth.staff_session.expire",
  // Two-factor (Phase 6b). Never codes, secrets or recovery codes; reason = endpoint and status.
  "auth.2fa.enroll_start",
  "auth.2fa.enable",
  "auth.2fa.disable",
  "auth.2fa.verify_fail",
  "auth.2fa.recovery_code.use",
  "auth.2fa.recovery_codes.regenerate",
  "auth.2fa.manage_fail",
  "auth.2fa.bypass_blocked",
  "auth.2fa.required",
  "email.send",
  "email.suppress",
  "email.fail",
  "role.grant",
  "role.revoke",
  "role.bootstrap",
  "policy.deny",
  // CMS (Phase 4c). Entity = content type; reason = status change. Never titles or text.
  "content.create",
  "content.update",
  "content.submit",
  "content.publish",
  "content.unpublish",
  "content.archive",
  "content.return_to_draft",
  "content.delete",
  "content.restore",
  "testimony.permission",
  "bible.permission",
  "verse.schedule",
  "media.upload",
  "media.delete",
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
