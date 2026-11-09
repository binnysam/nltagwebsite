// Live staging checks: the database and media folder staging is ABOUT to use are really staging's.
//
// Names in the environment are not enough (a pasted production DATABASE_URL could point at the
// production database under any name), so staging verifies the actual resources before the
// server, a migration or a seed may touch them:
//
//   Database  The server reports the database it connected to (SELECT DATABASE()); its name must
//             contain "staging", and its `nltag_environment` marker row must say "staging". The
//             production database has no marker, so it is refused. A brand-new empty database may
//             be claimed for staging once, by `npm run staging:init` (explicit, never at runtime).
//   Media     The folder's real path (symlinks resolved) must not overlap the production data
//             folder, and its `.nltag-environment` marker must say "staging". A non-empty folder
//             without the marker (e.g. production's) is refused; an empty one is claimed.
//
// The outcome is recorded on globalThis (shared by the instrumentation hook and every route in the
// same process); in staging, src/server/db/client.ts and the media store refuse to work until it
// is "verified". No value from the environment is ever printed: only rule names.
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import mysql from "mysql2/promise";
import { databaseNameOf, deploymentConfigProblems, isStaging, pathNamesStaging, pathsOverlap, productionDataRoot } from "./environment";

export const DB_MARKER_TABLE = "nltag_environment";
export const MEDIA_MARKER_FILE = ".nltag-environment";
export const STAGING = "staging";

export type VerifyState = { status: "verified" } | { status: "failed"; problems: string[] } | { status: "pending" };

const KEY = Symbol.for("nltag.deployment.verification");
type Holder = { [KEY]?: VerifyState };

export function verificationState(): VerifyState {
  return (globalThis as Holder)[KEY] ?? { status: "pending" };
}
function setState(s: VerifyState) {
  (globalThis as Holder)[KEY] = s;
}
/** Tests only. */
export function resetVerificationForTests() {
  delete (globalThis as Holder)[KEY];
}

export class StagingNotVerified extends Error {
  constructor(what: string) {
    const s = verificationState();
    super(`Staging safety check: ${what} refused (${s.status === "failed" ? s.problems.join("; ") : "staging resources not verified yet"})`);
    this.name = "StagingNotVerified";
  }
}

/** Throws unless this is not staging, or staging has been verified in this process. */
export function assertStagingVerified(what: string) {
  if (!isStaging()) return;
  if (verificationState().status !== "verified") throw new StagingNotVerified(what);
}

function accountHome(): string {
  try {
    return os.userInfo().homedir || os.homedir();
  } catch {
    return os.homedir();
  }
}

type Conn = Pick<mysql.Connection, "query">;

/** Database checks on an open connection. Returns problems (rule names only). */
export async function databaseIdentityProblems(conn: Conn, opts: { claimIfEmpty?: boolean } = {}): Promise<string[]> {
  const [[row]] = (await conn.query("SELECT DATABASE() AS db")) as unknown as [{ db: string | null }[]];
  const db = row?.db ?? "";
  if (!/staging/i.test(db)) return ["database: the connected database's name does not contain 'staging'"];
  const [tables] = (await conn.query(
    "SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()",
  )) as unknown as [{ t: string }[]];
  const names = new Set(tables.map((r) => r.t));
  if (!names.has(DB_MARKER_TABLE)) {
    if (names.size === 0 && opts.claimIfEmpty) {
      await conn.query(
        `CREATE TABLE ${DB_MARKER_TABLE} (k VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY, v VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, created_at DATETIME(3) NOT NULL)`,
      );
      await conn.query(`INSERT INTO ${DB_MARKER_TABLE} (k, v, created_at) VALUES ('environment', ?, UTC_TIMESTAMP(3))`, [STAGING]);
      return [];
    }
    return [
      names.size === 0
        ? "database: empty and not yet claimed for staging (run `npm run staging:init` once)"
        : "database: has tables but no staging marker (this is not the staging database)",
    ];
  }
  const [[marker]] = (await conn.query(`SELECT v FROM ${DB_MARKER_TABLE} WHERE k = 'environment'`)) as unknown as [{ v: string }[]];
  if (marker?.v !== STAGING) return ["database: its environment marker does not say staging"];
  return [];
}

/** Media folder checks. Creates the folder (0700) and claims it when it is new or empty. */
export async function mediaFolderProblems(dir: string, home: string = accountHome(), opts: { claim?: boolean } = { claim: true }): Promise<string[]> {
  if (!path.isAbsolute(dir)) return ["media: folder must be an absolute path"];
  if (!pathNamesStaging(dir)) return ["media: folder path does not name staging"];
  const prodRoot = productionDataRoot(home);
  let realProd = prodRoot;
  try {
    realProd = await fs.realpath(/* turbopackIgnore: true */ prodRoot);
  } catch {
    /* production folder absent on this machine */
  }
  try {
    await fs.mkdir(/* turbopackIgnore: true */ dir, { recursive: true, mode: 0o700 });
  } catch {
    return ["media: folder cannot be created"];
  }
  const real = await fs.realpath(/* turbopackIgnore: true */ dir);
  if (pathsOverlap(real, realProd) || pathsOverlap(real, prodRoot)) return ["media: folder resolves into the production data folder"];
  const marker = path.join(real, MEDIA_MARKER_FILE);
  try {
    const value = (await fs.readFile(/* turbopackIgnore: true */ marker, "utf8")).trim();
    return value === STAGING ? [] : ["media: folder's environment marker does not say staging"];
  } catch {
    const entries = (await fs.readdir(/* turbopackIgnore: true */ real)).filter((e) => e !== MEDIA_MARKER_FILE);
    if (entries.length > 0) return ["media: folder already holds files but no staging marker (not the staging folder)"];
    if (!opts.claim) return ["media: folder not yet claimed for staging"];
    await fs.writeFile(/* turbopackIgnore: true */ marker, `${STAGING}\n`, { flag: "wx", mode: 0o600 });
    return [];
  }
}

/**
 * Full staging verification (configuration, database, media). Records the outcome for this
 * process. Non-staging deployments return "verified" without I/O (nothing changes for them).
 */
export async function verifyDeployment(env: Record<string, string | undefined> = process.env, opts: { claimDatabaseIfEmpty?: boolean } = {}): Promise<VerifyState> {
  if (!isStaging(env)) {
    const problems = deploymentConfigProblems(env, accountHome());
    const state: VerifyState = problems.length ? { status: "failed", problems } : { status: "verified" };
    setState(state);
    return state;
  }
  const problems = deploymentConfigProblems(env, accountHome());
  if (problems.length === 0) {
    let conn: mysql.Connection | undefined;
    try {
      conn = await mysql.createConnection({ uri: env.DATABASE_URL, multipleStatements: false, connectTimeout: 10_000 });
      problems.push(...(await databaseIdentityProblems(conn, { claimIfEmpty: opts.claimDatabaseIfEmpty })));
    } catch (e) {
      problems.push(`database: connection failed (${(e as NodeJS.ErrnoException).code ?? "error"})`);
    } finally {
      await conn?.end().catch(() => undefined);
    }
    // The URL's database name and the server's answer must agree (no proxy or default-db tricks).
    if (!databaseNameOf(env.DATABASE_URL)) problems.push("DATABASE_URL: staging needs a database name");
    const media = env.NLTAG_MEDIA_DIR?.trim();
    if (media) problems.push(...(await mediaFolderProblems(path.normalize(media))));
  }
  const state: VerifyState = problems.length ? { status: "failed", problems } : { status: "verified" };
  setState(state);
  return state;
}
