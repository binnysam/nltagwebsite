import "server-only";
import { headers } from "next/headers";
import { accountsEnabled } from "../accounts-gate";
import { getPrincipal } from "../auth/session";
import type { Principal } from "../policy/permissions";
import { formsMode } from "./mode";

const VISITOR: Principal = { kind: "visitor" };

/**
 * Who is asking, for the public forms and the gallery (pages, server actions, the image route).
 * Only the staff-only test mode needs to know: with the forms off or open to everyone it never
 * touches the session. Signed out, accounts switched off, or any lookup failure → visitor, which
 * staff-only mode refuses (fail closed). Roles and two-factor are read from the database per request.
 */
export async function formsViewer(h?: Headers): Promise<Principal> {
  if (formsMode() !== "staff" || !accountsEnabled()) return VISITOR;
  try {
    return await getPrincipal(h ?? (await headers()));
  } catch {
    return VISITOR;
  }
}
