// D16 harness P2 — the saturating load generator (its own OS process, pinned away from P1).
// Floods POST /api/auth/sign-in/email on the loopback server with a fresh random UNKNOWN address per
// request (no per-address throttle applies) over C keep-alive connections, until SIGTERM.
// Usage: node load.mjs <baseUrl> <connections> <stats-file>
import http from "node:http";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

const base = new URL(process.argv[2] ?? "http://127.0.0.1:3200");
if (!["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)) throw new Error("D16 load generator: loopback targets only");
const connections = Number(process.argv[3] ?? 256);
const statsFile = process.argv[4];
const agent = new http.Agent({ keepAlive: true, maxSockets: connections });
const stats = { started: Date.now(), requests: 0, statuses: {}, errors: 0 };
let stop = false;

function once() {
  return new Promise((resolve) => {
    const body = JSON.stringify({ email: `d16-flood-${randomUUID()}@nltag.test`, password: "d16-flood-wrong-password" });
    const req = http.request(
      { host: base.hostname, port: base.port, path: "/api/auth/sign-in/email", method: "POST", agent, headers: { "content-type": "application/json", origin: base.origin, "content-length": Buffer.byteLength(body) } },
      (res) => {
        stats.statuses[res.statusCode] = (stats.statuses[res.statusCode] ?? 0) + 1;
        res.resume();
        res.on("end", resolve);
      },
    );
    req.on("error", () => {
      stats.errors += 1;
      setTimeout(resolve, 50);
    });
    req.end(body);
  });
}
async function worker() {
  while (!stop) {
    await once();
    stats.requests += 1;
  }
}
const workers = Array.from({ length: connections }, worker);
const finish = async () => {
  stop = true;
  stats.stopped = Date.now();
  stats.ratePerSecond = +(stats.requests / ((stats.stopped - stats.started) / 1000)).toFixed(1);
  if (statsFile) writeFileSync(statsFile, JSON.stringify(stats));
  await Promise.race([Promise.all(workers), new Promise((r) => setTimeout(r, 3000))]);
  process.exit(0);
};
process.on("SIGTERM", finish);
process.on("SIGINT", finish);
