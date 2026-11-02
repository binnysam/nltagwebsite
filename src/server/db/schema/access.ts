import { bigint, index, int, mysqlEnum, mysqlTable, primaryKey, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { asciiBin, idColumn, timestamp3 } from "../columns";
import { user } from "./auth";

/** The two CMS roles approved at Gate 0. A member has no staff role. */
export const STAFF_ROLES = ["CHURCH_ADMIN", "CONTENT_EDITOR"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const staffRole = mysqlTable(
  "staff_role",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    userId: idColumn("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: mysqlEnum("role", STAFF_ROLES).notNull(),
    /** Null only for the first Church Admin, created by the one-time server command. */
    grantedByUserId: idColumn("granted_by_user_id"),
    grantedAt: timestamp3("granted_at").notNull(),
  },
  (t) => [uniqueIndex("staff_role_user_role_uq").on(t.userId, t.role)],
);

export const AUDIT_OUTCOMES = ["SUCCESS", "DENIED", "FAILURE"] as const;
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];

/**
 * Append-only audit trail. Never store names, emails, dates of birth, phone numbers, tokens or
 * passwords here: only ids, an action name, an outcome and an HMAC of the IP address.
 * No foreign key on actor_user_id, so entries outlive a deleted account (kept 3 years, §9).
 */
export const auditLog = mysqlTable(
  "audit_log",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    actorUserId: idColumn("actor_user_id"),
    action: asciiBin("action", { length: 64 }).notNull(),
    outcome: mysqlEnum("outcome", AUDIT_OUTCOMES).notNull(),
    entity: asciiBin("entity", { length: 64 }),
    entityId: idColumn("entity_id"),
    ipHash: asciiBin("ip_hash", { length: 64 }),
    /** Short free-text reason (e.g. export justification). Must not contain personal data. */
    reason: varchar("reason", { length: 500 }),
    createdAt: timestamp3("created_at").notNull(),
  },
  (t) => [index("audit_log_actor_idx").on(t.actorUserId, t.createdAt), index("audit_log_action_idx").on(t.action, t.createdAt), index("audit_log_created_idx").on(t.createdAt)],
);

/**
 * Our own fixed-window counters for limits Better Auth does not cover: emails per address,
 * the daily outgoing-mail cap and (Phase 4c+) public forms. Keys never contain raw personal
 * data; addresses are HMAC'd first.
 */
export const rateLimitBucket = mysqlTable(
  "rate_limit_bucket",
  {
    bucketKey: asciiBin("bucket_key", { length: 191 }).notNull(),
    windowStart: bigint("window_start", { mode: "number", unsigned: true }).notNull(),
    count: int("count", { unsigned: true }).notNull(),
    expiresAt: timestamp3("expires_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.bucketKey, t.windowStart], name: "rate_limit_bucket_pk" }), index("rate_limit_bucket_expires_idx").on(t.expiresAt)],
);
