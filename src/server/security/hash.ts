import "server-only";
import { createHmac } from "node:crypto";
import { serverEnv } from "../env";

/**
 * Keyed hashes for values we need to compare but must not store: IP addresses in the audit log,
 * email addresses in rate-limit keys. HMAC with the auth secret so a leaked table cannot be
 * reversed by hashing every IPv4 address.
 */
export function keyedHash(purpose: "ip" | "email", value: string): string {
  return createHmac("sha256", serverEnv().BETTER_AUTH_SECRET).update(`${purpose}:${value.trim().toLowerCase()}`).digest("hex");
}

export const hashIp = (ip: string | null | undefined) => (ip ? keyedHash("ip", ip) : null);
export const hashEmail = (email: string) => keyedHash("email", email);
