import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";

/** Empties the test database (tables only; the database itself must exist) and applies all migrations. */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "mysql://nltag:nltag-local-dev-only@127.0.0.1:3306/nltag_test";
  if (!/nltag_test|_test$/.test(new URL(url).pathname)) throw new Error("Integration tests only run against a *_test database");
  const conn = await mysql.createConnection({ uri: url });
  const [rows] = await conn.query<mysql.RowDataPacket[]>("SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE()");
  await conn.query("SET FOREIGN_KEY_CHECKS = 0");
  for (const r of rows) await conn.query(`DROP TABLE IF EXISTS \`${String(r.t).replace(/`/g, "")}\``);
  await conn.query("SET FOREIGN_KEY_CHECKS = 1");
  await migrate(drizzle(conn), { migrationsFolder: "./drizzle" });
  await conn.end();
}
