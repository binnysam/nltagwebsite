import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { session as sessionTable } from "../db/schema";
import { can, SESSION_MAX_AGE_SECONDS, type Permission, type Principal } from "../policy/permissions";
import { audit } from "../services/audit";
import { rolesOf } from "../services/roles";
import { getAuth } from "./auth";

export interface CurrentUser {
  principal: Extract<Principal, { kind: "user" }>;
  userId: string;
  sessionId: string;
  email: string;
  name: string;
}

export class AuthzError extends Error {
  constructor(
    /** 401 = not signed in, 403 = signed in but not allowed, 404 = hide existence. */
    readonly status: 401 | 403 | 404,
    message = status === 401 ? "Sign-in required" : status === 403 ? "Not allowed" : "Not found",
  ) {
    super(message);
  }
}

/**
 * Resolves the caller from the session cookie on the request headers. Roles are read from the
 * database on every call (never from the client or a cached cookie), so a revoked role stops
 * working on the next request. Staff sessions older than 12 hours are ended here.
 */
export async function getCurrentUser(headers: Headers): Promise<CurrentUser | null> {
  const result = await getAuth().api.getSession({ headers, query: { disableCookieCache: true } });
  if (!result) return null;
  const roles = await rolesOf(result.user.id);
  if (roles.length > 0) {
    const ageSeconds = (Date.now() - new Date(result.session.createdAt).getTime()) / 1000;
    if (ageSeconds > SESSION_MAX_AGE_SECONDS.staff) {
      await getDb().delete(sessionTable).where(eq(sessionTable.id, result.session.id));
      await audit({ actorUserId: result.user.id, action: "auth.staff_session.expire", entity: "session", entityId: result.session.id });
      return null;
    }
  }
  return {
    principal: { kind: "user", userId: result.user.id, emailVerified: result.user.emailVerified, roles },
    userId: result.user.id,
    sessionId: result.session.id,
    email: result.user.email,
    name: result.user.name,
  };
}

export async function getPrincipal(headers: Headers): Promise<Principal> {
  return (await getCurrentUser(headers))?.principal ?? { kind: "visitor" };
}

/** First line of every protected server action and route handler (architecture §3). */
export async function requireUser(headers: Headers): Promise<CurrentUser> {
  const current = await getCurrentUser(headers);
  if (!current) throw new AuthzError(401);
  return current;
}

/**
 * Checks a permission on the server and audits denials. Hiding a button is never the only
 * control. Pass `hideAs404` for resources whose existence must not leak (other households).
 */
export async function requirePermission(headers: Headers, permission: Permission, opts: { hideAs404?: boolean } = {}): Promise<CurrentUser> {
  const current = await requireUser(headers);
  if (!can(current.principal, permission)) {
    await audit({ actorUserId: current.userId, action: "policy.deny", outcome: "DENIED", entity: "permission", reason: permission, ip: clientIp(headers) });
    throw new AuthzError(opts.hideAs404 ? 404 : 403);
  }
  return current;
}

export function clientIp(headers: Headers): string | null {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}
