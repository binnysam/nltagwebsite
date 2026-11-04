import "server-only";
import { log } from "../security/log";
import { getAuth } from "./auth";

/**
 * R4 v6.1 §3.8: how many recovery codes an account has left — the count only. Better Auth's
 * server-only viewBackupCodes returns the DECRYPTED codes; they stay inside this function and are
 * never returned, logged or passed to a page. This is the only allowed caller of viewBackupCodes
 * (tests/unit/server-api-allowlist.test.ts). `userId` must come from the caller's own session.
 */
export async function recoveryCodeCount(userId: string): Promise<number | null> {
  try {
    const r = await getAuth().api.viewBackupCodes({ body: { userId } });
    return Array.isArray(r.backupCodes) ? r.backupCodes.length : null;
  } catch (error) {
    log("warn", "two_factor.count_failed", { error });
    return null;
  }
}
