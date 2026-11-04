// D16 harness P3 — the timing probes (a third OS process). Sequential, interleaved, the class order
// rotating every round. Classes: "known" (an account, wrong password), "unknown" (no account, not
// listed) and, when D16_LISTED is set, "listed" (on the allowlist, no account: Better Auth's dummy
// hash). Before each known/listed probe it deletes that address's sign-in schedule key and every
// `class:K:*` window in the SCRATCH database, so every timed request takes the wrong-password path
// and must answer 401 (post-deployment review §6.2). The status of every probe is recorded; the run
// is rejected if any timed probe is not 401.
//
// Environment (no defaults for anything secret):
//   D16_BASE       loopback URL of P1, e.g. http://127.0.0.1:3200
//   D16_DB_URL     the scratch MariaDB (loopback host; database name must contain "d16")
//   D16_SECRET     the BETTER_AUTH_SECRET P1 runs with (random per run, never committed)
//   D16_KNOWN      comma-separated fictional @nltag.test addresses that have accounts
//   D16_LISTED     optional comma-separated fictional allowlisted addresses without accounts
//   D16_N          probes per class (default 200)
//   D16_OUT        CSV file to write
import http from "node:http";
import { createHmac, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import mysql from "mysql2/promise";

const env = (k, d) => {
  const v = process.env[k] ?? d;
  if (v === undefined || v === "") throw new Error(`D16 probe: ${k} is required`);
  return v;
};
const base = new URL(env("D16_BASE"));
const dbUrl = new URL(env("D16_DB_URL"));
const loopback = (h) => ["127.0.0.1", "localhost", "[::1]", "::1"].includes(h);
if (!loopback(base.hostname)) throw new Error("D16 probe: loopback server only");
if (!loopback(dbUrl.hostname) || !/d16/.test(dbUrl.pathname)) throw new Error("D16 probe: scratch database only (loopback host, name containing d16)");
const secret = env("D16_SECRET");
if (!/harness-only/.test(secret)) throw new Error("D16 probe: the harness secret must contain 'harness-only'");
const known = env("D16_KNOWN").split(",").filter(Boolean);
if (!known.every((a) => a.endsWith("@nltag.test"))) throw new Error("D16 probe: fictional @nltag.test addresses only");
const listed = (process.env.D16_LISTED ?? "").split(",").filter(Boolean);
if (!listed.every((a) => a.endsWith("@nltag.test"))) throw new Error("D16 probe: fictional @nltag.test addresses only");
const N = Number(process.env.D16_N ?? 200);
const out = env("D16_OUT");

const emailHash = (email) => createHmac("sha256", secret).update(`email:${email.trim().toLowerCase()}`).digest("hex");
const db = await mysql.createConnection({ uri: dbUrl.toString() });
async function freshBudget(address) {
  await db.execute("DELETE FROM rate_limit_bucket WHERE bucket_key = ?", [`signin-acct:${emailHash(address)}`]);
  await db.execute("DELETE FROM rate_limit_bucket WHERE bucket_key LIKE 'class:K:%'");
}

const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
function signIn(email) {
  const body = JSON.stringify({ email, password: "d16-probe-wrong-password" });
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    const req = http.request(
      { host: base.hostname, port: base.port, path: "/api/auth/sign-in/email", method: "POST", agent, headers: { "content-type": "application/json", origin: base.origin, "content-length": Buffer.byteLength(body) } },
      (res) => {
        res.resume();
        res.on("end", () => resolve({ status: res.statusCode, ms: performance.now() - t0 }));
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}

const classes = ["known", "unknown", ...(listed.length ? ["listed"] : [])];
const rows = ["seq,round,class,position,status,ms"];
let seq = 0;
let bad = 0;
for (let round = 0; round < N; round++) {
  // Rotate the order every round so no class always runs first.
  const order = classes.map((_, i) => classes[(i + round) % classes.length]);
  for (const [position, cls] of order.entries()) {
    let address;
    if (cls === "known") address = known[round % known.length];
    else if (cls === "listed") address = listed[round % listed.length];
    else address = `d16-unknown-${randomUUID()}@nltag.test`;
    if (cls !== "unknown") await freshBudget(address);
    const r = await signIn(address);
    if (r.status !== 401) bad += 1;
    rows.push(`${seq++},${round},${cls},${position},${r.status},${r.ms.toFixed(3)}`);
  }
}
writeFileSync(out, rows.join("\n") + "\n");
await db.end();
agent.destroy();
console.log(JSON.stringify({ probes: seq, non401: bad }));
process.exit(bad ? 2 : 0);
