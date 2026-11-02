// RFC 6238 TOTP for tests only (Node crypto, no dependency). Same algorithm as Better Auth's
// @better-auth/utils/otp: HMAC-SHA1, 6 digits, 30-second steps, secret used as raw bytes.
import { createHmac } from "node:crypto";

export function hotp(key: Uint8Array, counter: number, digits = 6): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", key).update(buf).digest();
  const offset = mac[mac.length - 1]! & 15;
  const bin = ((mac[offset]! & 127) << 24) | (mac[offset + 1]! << 16) | (mac[offset + 2]! << 8) | mac[offset + 3]!;
  return String(bin % 10 ** digits).padStart(digits, "0");
}

/** Code for `secret` (UTF-8 string or raw bytes) at `at` (ms). `step` shifts by whole periods. */
export function totp(secret: string | Uint8Array, at = Date.now(), step = 0): string {
  const key = typeof secret === "string" ? new TextEncoder().encode(secret) : secret;
  return hotp(key, Math.floor(at / 30_000) + step);
}

/** Decodes the base32 setup key shown on the enrollment page (spaces ignored). */
export function base32Decode(input: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = input.replace(/[\s=]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx < 0) throw new Error("not base32");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
}

/** A code that is wrong for `secret` now (and in the neighbouring steps the server accepts). */
export function wrongCode(secret: string | Uint8Array): string {
  const valid = new Set([-1, 0, 1].map((s) => totp(secret, Date.now(), s)));
  for (let i = 0; ; i++) {
    const c = String(i).padStart(6, "0");
    if (!valid.has(c)) return c;
  }
}

/** Waits until at least `ms` remain in the current 30 s step, so a code does not expire mid-test. */
export async function freshStep(ms = 5000) {
  const left = 30_000 - (Date.now() % 30_000);
  if (left < ms) await new Promise((r) => setTimeout(r, left + 50));
}
