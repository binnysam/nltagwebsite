import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encryption at rest for prayer requests (name, contact, request text): AES-256-GCM with a 32-byte
 * key from NLTAG_DATA_KEY (64 hex characters; generate with `openssl rand -hex 32`). A database
 * dump or backup alone does not reveal a prayer request. Each deployment has its own key: staging's
 * key never decrypts production rows and the other way round.
 *
 * Losing the key loses the stored requests (docs/operations/staging.md → "Data key"). Without a
 * valid key the prayer form is unavailable (fail closed) rather than storing plain text.
 *
 * Format: "v1.<iv b64url>.<tag b64url>.<ciphertext b64url>"; "" stays "" (field not given).
 */
const KEY_PATTERN = /^[0-9a-f]{64}$/i;

export function dataKeyConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return KEY_PATTERN.test((env.NLTAG_DATA_KEY ?? "").trim());
}

function key(): Buffer {
  const raw = (process.env.NLTAG_DATA_KEY ?? "").trim();
  if (!KEY_PATTERN.test(raw)) throw new Error("NLTAG_DATA_KEY is not configured");
  return Buffer.from(raw, "hex");
}

export function encryptText(plain: string): string {
  if (plain === "") return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptText(stored: string): string {
  if (stored === "") return "";
  const [v, iv, tag, ct] = stored.split(".");
  if (v !== "v1" || !iv || !tag || ct === undefined) throw new Error("Unreadable encrypted value");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}
