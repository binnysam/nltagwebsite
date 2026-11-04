// D16 harness: adds fictional accounts (verified, with a password nobody knows) to the SCRATCH
// database (after db:migrate). Whether they are allowlisted is decided by run.sh's
// NLTAG_SIGNUP_ALLOWLIST, not here: "d16-known" accounts are not on the list, "d16-listed-acct"
// accounts are (the shape of every production staff account, D16 finding 3).
// Usage: D16_DB_URL=... node seed-accounts.mjs <count> [prefix]   → prints the comma-separated addresses.
//   prefix: d16-known (default) or d16-listed-acct
import { randomUUID, randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import mysql from "mysql2/promise";

const url = new URL(process.env.D16_DB_URL ?? "");
if (!["127.0.0.1", "localhost"].includes(url.hostname) || !/d16/.test(url.pathname)) throw new Error("D16 seed: scratch database only (loopback host, name containing d16)");
const count = Number(process.argv[2] ?? 10);
const prefix = process.argv[3] ?? "d16-known";
if (!["d16-known", "d16-listed-acct"].includes(prefix)) throw new Error("D16 seed: prefix must be d16-known or d16-listed-acct");
const db = await mysql.createConnection({ uri: url.toString(), timezone: "Z" });
// A random password nobody knows: the probes only ever send wrong passwords.
const hash = await hashPassword(randomBytes(18).toString("base64url"));
const now = new Date();
const out = [];
for (let i = 0; i < count; i++) {
  const email = `${prefix}-${i}@nltag.test`;
  out.push(email);
  const [rows] = await db.execute("SELECT id FROM user WHERE email = ?", [email]);
  if (rows.length) continue;
  const id = randomUUID();
  await db.execute("INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)", [id, `D16 ${prefix} ${i}`, email, now, now]);
  await db.execute("INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES (?, ?, 'credential', ?, ?, ?, ?)", [randomUUID(), id, id, hash, now, now]);
}
await db.end();
console.log(out.join(","));
