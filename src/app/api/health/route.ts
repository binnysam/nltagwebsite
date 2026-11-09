import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { deploymentKind } from "@/server/deployment/environment";
import { verificationState } from "@/server/deployment/verify";

/**
 * Health check for Hostinger and the staging QA pass: GET /api/health.
 * Reports booleans and the deployment kind only; never a host, database name, path or error text.
 * 200 when the database answers (and, on staging, the live staging check has passed); else 503.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const kind = deploymentKind();
  const verified = verificationState().status === "verified";
  let database = false;
  try {
    await getDb().execute(sql`SELECT 1`);
    database = true;
  } catch {
    database = false;
  }
  const ok = database && (kind !== "staging" || verified);
  return Response.json(
    { status: ok ? "ok" : "unavailable", deployment: kind, database, stagingVerified: kind === "staging" ? verified : undefined },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
