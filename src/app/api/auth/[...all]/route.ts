import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/server/auth/auth";
import { accountsEnabled } from "@/server/accounts-gate";
import { gateAuthRequest, gateNotFound } from "@/server/security/auth-abuse-gate";
import { withTrustedClientIpRequest } from "@/server/security/client-ip";

// Auth responses are per-user and must never be cached or indexed.
export const dynamic = "force-dynamic";

/**
 * Every request passes the R4 gate first (default-deny route table, budgets, timing floors).
 * Better Auth only ever sees requests the gate allowed. Accounts off → 404 for everything.
 */
const handler = async (req: Request): Promise<Response> =>
  accountsEnabled() ? gateAuthRequest(req, (r) => getAuth().handler(withTrustedClientIpRequest(r))) : gateNotFound();

export const { GET, POST } = toNextJsHandler(handler);
