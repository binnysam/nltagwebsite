import "server-only";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { assertStagingVerified } from "../deployment/verify";
import { serverEnv } from "../env";
import * as schema from "./schema";

export type Db = MySql2Database<typeof schema>;

let pool: mysql.Pool | undefined;
let db: Db | undefined;

/**
 * One small pool per process (Hostinger shared hosting: one Node process, modest limits).
 * Hostinger guidance: connect to 127.0.0.1, not localhost (IPv6 ::1 may lack a grant).
 */
export function getPool(): mysql.Pool {
  if (pool) return pool;
  // Staging: no query before the live check has confirmed this is the staging database.
  assertStagingVerified("database access");
  pool = mysql.createPool({
    uri: serverEnv().DATABASE_URL,
    connectionLimit: 5,
    charset: "UTF8MB4_UNICODE_CI", // handshake only; SET NAMES below selects the uca1400 collation
    timezone: "Z",
    dateStrings: false,
    supportBigNumbers: true,
    // Never build SQL by string; this blocks stacked statements as a second line of defence.
    multipleStatements: false,
  });
  pool.on("connection", (conn) => {
    conn.query("SET time_zone = '+00:00', NAMES utf8mb4 COLLATE utf8mb4_uca1400_ai_ci");
  });
  return pool;
}

export function getDb(): Db {
  if (db) return db;
  db = drizzle(getPool(), { schema, mode: "default" });
  return db;
}

/** Tests and scripts close the pool so the process can exit. */
export async function closeDb() {
  const p = pool;
  pool = undefined;
  db = undefined;
  if (p) await p.end();
}
