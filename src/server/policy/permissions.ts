import type { StaffRole } from "../db/schema/access";
import { roleRequiresTwoFactor } from "../auth/two-factor-policy";

/**
 * Permission matrix (architecture §5). Pure data, no I/O, so it is unit-tested exhaustively and
 * readable by the next phases. Members (signed in, no staff role) and visitors get only the
 * "own" and "published" permissions; everything else needs a staff role.
 *
 * Rule: a new permission is denied to every role until it is added here on purpose.
 */
export const PERMISSIONS = [
  // Content (Phase 4c)
  "content.read_published",
  "content.draft.edit",
  "content.submit_for_review",
  "content.publish",
  "media.upload",
  // Own account and own membership (Phase 4d)
  "account.manage_own",
  "membership.own",
  // Membership administration (Phase 4d) — Church Admin only
  "membership.read_any",
  "membership.decide",
  "membership.birthdays",
  "membership.reports",
  "membership.export",
  // System
  "staff.manage",
  "audit.read",
  /** CMS staff area (content lists, editor, media, review). Not granted to Prayer Team. */
  "admin.access",
  /** The admin shell itself (sign-in landing, dashboard). Every staff role. */
  "staff.portal",
  // Public submissions (Nov 2026). Prayer requests: Church Admin and Prayer Team only, never
  // Content Editors (owner requirement). Contact messages: Church Admin only.
  "prayer.read",
  "prayer.manage",
  "prayer.delete",
  "contact.read",
  "contact.manage",
  "submission.read",
  "submission.decide",
  /** Testimony submitters' contact details and deleting submissions. Church Admin only. */
  "submission.contact",
  /** Gallery: record photo permission, publish and unpublish photos. Church Admin only. */
  "gallery.publish",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export type Principal =
  | { kind: "visitor" }
  | {
      kind: "user";
      userId: string;
      emailVerified: boolean;
      roles: readonly StaffRole[];
      /** A verified authenticator app is set up (Phase 6b). Read from the database per request. */
      twoFactorEnabled: boolean;
    };

const VISITOR: readonly Permission[] = ["content.read_published"];
const MEMBER: readonly Permission[] = [...VISITOR, "account.manage_own", "membership.own"];

const ROLE_GRANTS: Record<StaffRole, readonly Permission[]> = {
  CONTENT_EDITOR: ["admin.access", "staff.portal", "content.draft.edit", "content.submit_for_review", "media.upload", "submission.read", "submission.decide"],
  PRAYER_TEAM: ["staff.portal", "prayer.read", "prayer.manage"],
  CHURCH_ADMIN: [
    "admin.access",
    "staff.portal",
    "prayer.read",
    "prayer.manage",
    "prayer.delete",
    "contact.read",
    "contact.manage",
    "submission.read",
    "submission.decide",
    "submission.contact",
    "gallery.publish",
    "content.draft.edit",
    "content.publish",
    "media.upload",
    "membership.read_any",
    "membership.decide",
    "membership.birthdays",
    "membership.reports",
    "membership.export",
    "staff.manage",
    "audit.read",
  ],
};

/** Permissions that require a verified email even for staff. */
const NEEDS_VERIFIED_EMAIL = new Set<Permission>(PERMISSIONS.filter((p) => p !== "content.read_published" && p !== "account.manage_own"));

export function permissionsFor(principal: Principal): ReadonlySet<Permission> {
  if (principal.kind === "visitor") return new Set(VISITOR);
  const granted = new Set<Permission>(MEMBER);
  for (const role of principal.roles) {
    // Phase 6b: a role that requires two-factor grants nothing until it is set up, everywhere
    // (pages, server actions and services all ask `can()`).
    if (roleRequiresTwoFactor(role) && !principal.twoFactorEnabled) continue;
    for (const p of ROLE_GRANTS[role] ?? []) granted.add(p);
  }
  if (!principal.emailVerified) for (const p of [...granted]) if (NEEDS_VERIFIED_EMAIL.has(p)) granted.delete(p);
  return granted;
}

export function can(principal: Principal, permission: Permission): boolean {
  return permissionsFor(principal).has(permission);
}

/** Staff sessions last 12 hours; member sessions 7 days (architecture §0). */
export const SESSION_MAX_AGE_SECONDS = { member: 7 * 24 * 3600, staff: 12 * 3600 } as const;
