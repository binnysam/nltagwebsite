// D16 harness: samples the CPU of P1 (the server process and all its descendants) once a second
// from /proc (Linux), in percent of one core (as pidstat reports), until SIGTERM.
// Usage: node cpu.mjs <pid> <csv-file>
import { readFileSync, readdirSync, writeFileSync, appendFileSync } from "node:fs";

const root = Number(process.argv[2]);
const out = process.argv[3];
const hz = 100; // USER_HZ on Linux
writeFileSync(out, "t_ms,cpu_percent,pids\n");
const stat = (pid) => {
  const s = readFileSync(`/proc/${pid}/stat`, "utf8");
  const f = s.slice(s.lastIndexOf(")") + 2).split(" ");
  return { ppid: Number(f[1]), ticks: Number(f[11]) + Number(f[12]) };
};
function tree() {
  const all = new Map();
  for (const d of readdirSync("/proc")) {
    if (!/^\d+$/.test(d)) continue;
    try {
      all.set(Number(d), stat(d));
    } catch {}
  }
  const pids = new Set([root]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [pid, s] of all) {
      if (!pids.has(pid) && pids.has(s.ppid)) {
        pids.add(pid);
        grew = true;
      }
    }
  }
  let ticks = 0;
  for (const p of pids) ticks += all.get(p)?.ticks ?? 0;
  return { ticks, n: pids.size };
}
let prev = tree();
let prevT = Date.now();
const t0 = prevT;
const timer = setInterval(() => {
  const cur = tree();
  const now = Date.now();
  const pct = ((cur.ticks - prev.ticks) / hz / ((now - prevT) / 1000)) * 100;
  appendFileSync(out, `${now - t0},${pct.toFixed(1)},${cur.n}\n`);
  prev = cur;
  prevT = now;
}, 1000);
const stop = () => (clearInterval(timer), process.exit(0));
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
