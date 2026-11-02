import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/server/auth/auth";
import { accountsEnabled } from "@/server/accounts-gate";
import { withTrustedClientIpRequest } from "@/server/security/client-ip";

// Auth responses are per-user and must never be cached or indexed.
export const dynamic = "force-dynamic";

/** Plain 404 while accounts are switched off (see src/server/accounts-gate.ts). */
const notFound = () => new Response("Not Found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });

/**
 * Better Auth keys its rate limits on x-nltag-client-ip only (auth.ts). It is rebuilt here from
 * the CDN's headers even though src/proxy.ts already did so: this route must stay safe on its own.
 */
const handler = async (req: Request): Promise<Response> => (accountsEnabled() ? getAuth().handler(withTrustedClientIpRequest(req)) : notFound());

export const { GET, POST } = toNextJsHandler(handler);
