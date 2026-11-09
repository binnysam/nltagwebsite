// Staging isolation against a real MariaDB (docs/operations/staging.md).
//
// 1. The production-shaped database (this suite's own, which has every table and no staging
//    marker) is refused by the live identity check, and nothing is written to it.
// 2. A staging-named database is claimed only when empty and only by staging:init, then accepted.
//    Needs a second, empty database whose name contains "staging" (TEST_STAGING_DATABASE_URL);
//    CI's MariaDB user cannot create databases, so this block runs where that variable is set.
import mysql from "mysql2/promise";
import { DB_MARKER_TABLE, databaseIdentityProblems, resetVerificationForTests, verifyDeployment } from "@/server/deployment/verify";

const TEST_URL = process.env.DATABASE_URL as string;
const STAGING_URL = process.env.TEST_STAGING_DATABASE_URL;

async function tables(conn: mysql.Connection) {
  const [rows] = (await conn.query("SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()")) as unknown as [{ t: string }[]];
  return rows.map((r) => r.t);
}

describe("staging refuses a non-staging database (real MariaDB)", () => {
  let conn: mysql.Connection;
  beforeAll(async () => {
    conn = await mysql.createConnection({ uri: TEST_URL });
  });
  afterAll(async () => {
    await conn.end();
    resetVerificationForTests();
  });

  it("refuses the populated, unmarked database even when asked to claim, and writes nothing", async () => {
    const before = await tables(conn);
    expect(before).toContain("user");
    const problems = await databaseIdentityProblems(conn, { claimIfEmpty: true });
    expect(problems.join()).toMatch(/does not contain 'staging'|no staging marker/);
    expect(await tables(conn)).toEqual(before);
    expect(before).not.toContain(DB_MARKER_TABLE);
  });

  it("verifyDeployment with a staging configuration aimed at this database fails before connecting", async () => {
    const state = await verifyDeployment({
      NODE_ENV: "production",
      NLTAG_DEPLOYMENT: "staging",
      BETTER_AUTH_URL: "http://127.0.0.1:3200",
      BETTER_AUTH_SECRET: `nltag-staging-${"y".repeat(48)}`,
      DATABASE_URL: TEST_URL,
      NLTAG_MEDIA_DIR: "/tmp/nltag-data-staging/media",
      AUTH_RATE_LIMIT: "on",
    });
    expect(state.status).toBe("failed");
    expect(state.status === "failed" && state.problems.join()).toMatch(/DATABASE_URL/);
  });
});

describe.runIf(Boolean(STAGING_URL))("staging database claim and acceptance (real MariaDB, TEST_STAGING_DATABASE_URL)", () => {
  let conn: mysql.Connection;
  beforeAll(async () => {
    conn = await mysql.createConnection({ uri: STAGING_URL as string });
    for (const t of await tables(conn)) await conn.query(`DROP TABLE \`${t}\``);
  });
  afterAll(async () => {
    for (const t of await tables(conn)) await conn.query(`DROP TABLE \`${t}\``);
    await conn.end();
  });

  it("an empty staging database is refused at runtime, claimed by init, then accepted", async () => {
    expect((await databaseIdentityProblems(conn)).join()).toMatch(/not yet claimed/);
    expect(await tables(conn)).toEqual([]);
    expect(await databaseIdentityProblems(conn, { claimIfEmpty: true })).toEqual([]);
    expect(await tables(conn)).toEqual([DB_MARKER_TABLE]);
    expect(await databaseIdentityProblems(conn)).toEqual([]);
  });

  it("a marker naming another environment is refused", async () => {
    await conn.query(`UPDATE ${DB_MARKER_TABLE} SET v = 'production' WHERE k = 'environment'`);
    expect((await databaseIdentityProblems(conn)).join()).toMatch(/does not say staging/);
    await conn.query(`UPDATE ${DB_MARKER_TABLE} SET v = 'staging' WHERE k = 'environment'`);
  });

  it("a staging-named database with tables but no marker is refused", async () => {
    await conn.query(`DROP TABLE ${DB_MARKER_TABLE}`);
    await conn.query("CREATE TABLE user (id INT PRIMARY KEY)");
    expect((await databaseIdentityProblems(conn, { claimIfEmpty: true })).join()).toMatch(/no staging marker/);
  });
});
