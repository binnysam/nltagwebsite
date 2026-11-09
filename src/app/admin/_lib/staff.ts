import "server-only";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { accountsEnabled } from "@/server/accounts-gate";
import { AuthzError, clientIp, getCurrentUser, mustEnrollTwoFactor, type CurrentUser } from "@/server/auth/session";
import { CmsError, type Ctx } from "@/server/cms/service";
import { RoleError } from "@/server/services/roles";
import { can, type Permission } from "@/server/policy/permissions";
import { audit } from "@/server/services/audit";
import { log } from "@/server/security/log";

/**
 * Gate for every admin page. The admin follows the accounts gate: while account pages are hidden
 * (no SMTP yet) nobody can sign in, so /admin returns 404 too. Signed out → sign-in page.
 * Signed in without a staff role → 404 (the admin's existence is not advertised to members).
 * Church Admin without a verified authenticator app (Phase 6b) → the two-factor setup page; the
 * role grants no permission until then (permissions.ts), so services refuse as well.
 * This is a convenience for pages; every service call checks permissions again.
 */
export async function requireStaffPage(permission: Permission = "admin.access"): Promise<Ctx> {
  await connection();
  if (!accountsEnabled()) notFound();
  const h = await headers();
  const me = await getCurrentUser(h);
  if (!me) redirect("/en/sign-in");
  if (mustEnrollTwoFactor(me)) {
    await audit({ actorUserId: me.userId, action: "auth.2fa.required", outcome: "DENIED", entity: "permission", reason: permission, ip: clientIp(h) });
    redirect("/en/account/two-factor");
  }
  if (!can(me.principal, "staff.portal") || !can(me.principal, permission)) {
    await audit({ actorUserId: me.userId, action: "policy.deny", outcome: "DENIED", entity: "permission", reason: permission, ip: clientIp(h) });
    notFound();
  }
  return { actor: me, ip: clientIp(h) };
}

/** Server actions: same checks, but returns null instead of redirecting so the form can show a message. */
export async function actionCtx(): Promise<Ctx | null> {
  if (!accountsEnabled()) return null;
  const h = await headers();
  const me: CurrentUser | null = await getCurrentUser(h);
  if (!me) return null;
  return { actor: me, ip: clientIp(h) };
}

export interface ActionState {
  ok: boolean;
  message: string;
  errors?: Record<string, string>;
  /** Monotonic counter so the form can react to each submission. */
  seq: number;
  version?: number;
}

/** Turns service errors into words for the form. Unexpected errors are logged, never shown. */
export function errorState(error: unknown, seq: number): ActionState {
  if (error instanceof AuthzError) {
    return { ok: false, seq, message: error.status === 401 ? "Your session has ended. Sign in again." : "Your role does not allow this action." };
  }
  if (error instanceof CmsError) return { ok: false, seq, message: error.message, errors: error.fieldErrors };
  if (error instanceof RoleError) return { ok: false, seq, message: error.message };
  log("error", "admin.action_failed", { error });
  return { ok: false, seq, message: "Something went wrong. Nothing was changed. Try again." };
}

/**
 * Redirect-based actions pass a fixed error key in the URL, never free text, so a crafted link
 * cannot make the admin display arbitrary wording.
 */
export const ERROR_MESSAGES = {
  session: "Your session has ended. Sign in again.",
  forbidden: "Your role does not allow this action.",
  state: "That action is not available for this item in its current state.",
  "testimony-permission": "Record the author's permission before publishing this testimony.",
  "not-found": "That item no longer exists.",
  "last-admin": "The last Church Admin cannot be removed.",
  self: "You cannot change your own roles.",
  invalid: "The request was not valid. Nothing was changed.",
  "photo-permission": "Record the photo permission before publishing.",
  "photo-note": "Say where the photo permission is documented.",
  "photo-caption": "Add a caption in at least one language before publishing (it is also the image description).",
  "photo-processing": "The image could not be prepared for the website. Nothing was published.",
  "already-decided": "This submission has already been decided.",
  generic: "Something went wrong. Nothing was changed. Try again.",
} as const;
export type ErrorKey = keyof typeof ERROR_MESSAGES;

export function errorKey(error: unknown): ErrorKey {
  if (error instanceof AuthzError) return error.status === 401 ? "session" : "forbidden";
  if (error instanceof CmsError) {
    if (error.code === "NOT_FOUND") return "not-found";
    if (/photo permission before/.test(error.message)) return "photo-permission";
    if (/permission is documented/.test(error.message)) return "photo-note";
    if (/Add a caption/.test(error.message)) return "photo-caption";
    if (/prepared for the website|file is missing/.test(error.message)) return "photo-processing";
    if (/already been decided/.test(error.message)) return "already-decided";
    if (error.code === "NOT_ALLOWED_IN_STATE") return /permission/.test(error.message) ? "testimony-permission" : "state";
    return "invalid";
  }
  if (error instanceof RoleError) return error.code === "LAST_ADMIN" ? "last-admin" : error.code === "SELF_CHANGE" ? "self" : "invalid";
  log("error", "admin.action_failed", { error });
  return "generic";
}

export function messageFor(key: string | undefined): string | null {
  return key && key in ERROR_MESSAGES ? ERROR_MESSAGES[key as ErrorKey] : null;
}
