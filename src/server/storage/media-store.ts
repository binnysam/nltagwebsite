import "server-only";
// Image file storage outside the deployment (Phase 4c, owner decision 2 Nov 2026; persistence
// verified on production across two fresh Hostinger deployments the same day).
//
//   <media dir>/<first two hex chars of id>/<id>      (no extension, mode 0600, folders 0700)
//
// Files are never served by the web server (outside public_html), never imported or executed by
// the app, and carry no extension, so no handler maps them to code. The database row holds the
// type, size and SHA-256; reads are checked against the hash. Writes are atomic (temp + rename).
import { createHash, randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { assertStagingVerified } from "../deployment/verify";
import { resolveMediaDir } from "./media-dir";

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class MediaStorageUnavailable extends Error {
  constructor(reason: string) {
    super(`Image storage is not available: ${reason}`);
    this.name = "MediaStorageUnavailable";
  }
}

function mediaDir(): string {
  // Staging: never read or write a folder the live check has not confirmed as staging's own.
  assertStagingVerified("media storage");
  const r = resolveMediaDir();
  if (!r.ok) throw new MediaStorageUnavailable(r.reason);
  return r.dir;
}

/** Relative key stored in the database; derived only from a validated UUID (no traversal possible). */
export function storageKey(id: string): string {
  if (!ID.test(id)) throw new Error("Invalid media id");
  return `${id.slice(0, 2)}/${id}`;
}

function filePath(key: string): string {
  const [shard, id, ...rest] = key.split("/");
  if (rest.length || !shard || !id || !ID.test(id) || shard !== id.slice(0, 2)) throw new Error("Invalid media key");
  return path.join(mediaDir(), shard, id);
}

export async function writeMediaFile(id: string, bytes: Uint8Array): Promise<string> {
  const key = storageKey(id);
  const target = filePath(key);
  await fs.mkdir(/* turbopackIgnore: true */ path.dirname(target), { recursive: true, mode: 0o700 });
  const tmp = `${target}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await fs.writeFile(/* turbopackIgnore: true */ tmp, bytes, { flag: "wx", mode: 0o600 });
    await fs.rename(/* turbopackIgnore: true */ tmp, target);
  } catch (e) {
    await fs.rm(/* turbopackIgnore: true */ tmp, { force: true }).catch(() => undefined);
    throw e;
  }
  return key;
}

/** Bytes for a stored file, or null if missing or if the content no longer matches its hash. */
export async function readMediaFile(key: string, sha256: string): Promise<Buffer | null> {
  try {
    const data = await fs.readFile(/* turbopackIgnore: true */ filePath(key));
    return createHash("sha256").update(data).digest("hex") === sha256 ? data : null;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

/** Removes a file written for an upload whose database row was never committed. */
export async function discardMediaFile(key: string): Promise<void> {
  await fs.rm(/* turbopackIgnore: true */ filePath(key), { force: true }).catch(() => undefined);
}
