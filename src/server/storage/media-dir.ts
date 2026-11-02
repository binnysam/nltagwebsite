// Media storage location and the startup storage probe (Phase 4c, owner decision 2 Nov 2026).
//
// Uploaded images are to live OUTSIDE the deployed application, in a folder Hostinger's Git
// deployment never replaces: by default `<account home>/nltag-data/media` (home from the system user database, because
// Hostinger sets $HOME to the domain folder for the Node.js app), which on the production
// account is /home/u339364475/nltag-data/media. `NLTAG_MEDIA_DIR` (absolute path) overrides it.
//
// This module is deliberately free of Next.js and database imports so the probe can run from
// `src/instrumentation.ts` at server start. The probe never throws and never logs file contents,
// environment values or anything personal: only the path, booleans, a timestamp and the app
// folder, so a deployment's runtime log shows whether the folder is writable and whether a
// marker written by an EARLIER deployment is still there (the persistence check).
import { randomBytes } from "node:crypto";
import { constants as fsc, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

export const MARKER_FILE = ".nltag-storage-marker.json";

/**
 * The hosting account's home folder from the system user database, not $HOME. On Hostinger the
 * Node.js app runs with HOME set to the domain folder (/home/<user>/domains/<domain>), but the
 * approved media folder is /home/<user>/nltag-data/media (first production probe, 2 Nov 2026).
 */
export function accountHome(): string {
  try {
    return os.userInfo().homedir || os.homedir();
  } catch {
    return os.homedir();
  }
}

export type MediaDirResolution =
  | { ok: true; dir: string; source: "env" | "home" | "dev" }
  | { ok: false; reason: string };

/** Where media files belong. Pure: no disk access. */
export function resolveMediaDir(
  env: Record<string, string | undefined> = process.env,
  home: string = accountHome(),
  appDir: string = process.cwd(),
): MediaDirResolution {
  const configured = env.NLTAG_MEDIA_DIR?.trim();
  let dir: string;
  let source: "env" | "home" | "dev";
  if (configured) {
    if (!path.isAbsolute(configured)) return { ok: false, reason: "NLTAG_MEDIA_DIR must be an absolute path" };
    dir = path.normalize(configured);
    source = "env";
  } else if (env.NODE_ENV === "production") {
    dir = path.join(home, "nltag-data", "media");
    source = "home";
  } else {
    dir = path.join(appDir, ".data", "media"); // git-ignored, local development and tests only
    source = "dev";
  }
  if (source !== "dev") {
    const reason = unsafeLocation(dir, appDir);
    if (reason) return { ok: false, reason };
  }
  return { ok: true, dir, source };
}

/** Production media must never sit inside the app folder (replaced on deploy) or a web root (served/executed by the web server). */
export function unsafeLocation(dir: string, appDir: string): string | null {
  const inside = (child: string, parent: string) => {
    const rel = path.relative(parent, child);
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  };
  if (inside(dir, appDir)) return "media folder is inside the application folder";
  if (dir.split(path.sep).includes("public_html")) return "media folder is inside a public web root";
  return null;
}

export interface ProbeResult {
  dir: string | null;
  source: string | null;
  writable: boolean;
  readBack: boolean;
  dirMode: string | null;
  markerExisted: boolean;
  markerCreatedAt: string | null;
  markerAppDir: string | null;
  appDir: string;
  checkedAt: string;
  error?: string;
}

/** Creates the folder (0700) if needed, writes/reads/removes a probe file, and keeps a persistence marker. */
export async function probeMediaStorage(
  env: Record<string, string | undefined> = process.env,
  now: Date = new Date(),
): Promise<ProbeResult> {
  let appDir = process.cwd(); // file tracing: every fs call below is marked turbopackIgnore (runtime paths, not app files)
  try { appDir = await fs.realpath(/* turbopackIgnore: true */ appDir); } catch { /* keep cwd */ }
  const base: ProbeResult = {
    dir: null, source: null, writable: false, readBack: false, dirMode: null,
    markerExisted: false, markerCreatedAt: null, markerAppDir: null, appDir, checkedAt: now.toISOString(),
  };
  const resolved = resolveMediaDir(env, accountHome(), appDir);
  if (!resolved.ok) return { ...base, error: resolved.reason };
  const result: ProbeResult = { ...base, dir: resolved.dir, source: resolved.source };
  try {
    await fs.mkdir(/* turbopackIgnore: true */ resolved.dir, { recursive: true, mode: 0o700 });
    const st = await fs.stat(/* turbopackIgnore: true */ resolved.dir);
    result.dirMode = (st.mode & 0o777).toString(8);

    // Probe: exclusive create, read back, remove. Not executable (0600), random name.
    const probe = path.join(resolved.dir, `.probe-${randomBytes(8).toString("hex")}`);
    const token = randomBytes(16).toString("hex");
    await fs.writeFile(/* turbopackIgnore: true */ probe, token, { flag: "wx", mode: 0o600 });
    result.writable = true;
    result.readBack = (await fs.readFile(/* turbopackIgnore: true */ probe, "utf8")) === token;
    await fs.unlink(/* turbopackIgnore: true */ probe);

    // Persistence marker: written once; later deployments report whether they still see it.
    const marker = path.join(resolved.dir, MARKER_FILE);
    try {
      const prev = JSON.parse(await fs.readFile(/* turbopackIgnore: true */ marker, "utf8")) as { createdAt?: unknown; appDir?: unknown };
      result.markerExisted = true;
      result.markerCreatedAt = typeof prev.createdAt === "string" ? prev.createdAt : null;
      result.markerAppDir = typeof prev.appDir === "string" ? prev.appDir : null;
    } catch {
      const fh = await fs.open(/* turbopackIgnore: true */ marker, fsc.O_WRONLY | fsc.O_CREAT | fsc.O_EXCL, 0o600).catch(() => null);
      if (fh) {
        await fh.writeFile(JSON.stringify({ createdAt: result.checkedAt, appDir }));
        await fh.close();
      }
      result.markerCreatedAt = result.checkedAt;
      result.markerAppDir = appDir;
    }
  } catch (e) {
    result.error = e instanceof Error ? (e as NodeJS.ErrnoException).code ?? "write failed" : "write failed";
  }
  return result;
}

/** Read-only: is a marker from an earlier deployment present in `dir`? Used to confirm earlier probe folders persisted. */
export async function readMarker(dir: string): Promise<{ dir: string; markerExisted: boolean; markerCreatedAt: string | null }> {
  try {
    const prev = JSON.parse(await fs.readFile(/* turbopackIgnore: true */ path.join(dir, MARKER_FILE), "utf8")) as { createdAt?: unknown };
    return { dir, markerExisted: true, markerCreatedAt: typeof prev.createdAt === "string" ? prev.createdAt : null };
  } catch {
    return { dir, markerExisted: false, markerCreatedAt: null };
  }
}

/** $HOME-based folder used by the first production probe (2 Nov 2026); checked read-only for persistence. */
export function earlierProbeDir(): string {
  return path.join(os.homedir(), "nltag-data", "media");
}
