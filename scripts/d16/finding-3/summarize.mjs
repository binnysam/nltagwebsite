// D16 finding 3: per-class summary and median differences vs U with a
// bootstrap 95% interval (each class resampled independently). Usage: node scripts/d16/finding-3/summarize.mjs <probes.csv> [label]
import { readFileSync } from "node:fs";

const [file, label = file] = process.argv.slice(2);
const rows = readFileSync(file, "utf8").trim().split("\n").slice(1).map((l) => l.split(","));
const by = {};
let non401 = 0;
for (const [round, cls, , status, ms] of rows) {
  (by[cls] ??= []).push({ round: Number(round), ms: Number(ms) });
  if (status !== "401") non401 += 1;
}
const q = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  const i = (p / 100) * (s.length - 1);
  const lo = Math.floor(i);
  return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo);
};
let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const boot = (a, b, B = 4000) => {
  const d = [];
  for (let i = 0; i < B; i++) {
    const ra = a.map(() => a[Math.floor(rnd() * a.length)]);
    const rb = b.map(() => b[Math.floor(rnd() * b.length)]);
    d.push(q(ra, 50) - q(rb, 50));
  }
  return [q(d, 2.5), q(d, 97.5)];
};
console.log(`== ${label}  (non-401: ${non401})`);
const u = by.U.map((r) => r.ms);
for (const cls of Object.keys(by)) {
  const xs = by[cls].map((r) => r.ms);
  const line = `${cls.padEnd(3)} n=${xs.length} p10=${q(xs, 10).toFixed(1)} median=${q(xs, 50).toFixed(1)} p90=${q(xs, 90).toFixed(1)}`;
  if (cls === "U") {
    console.log(line);
    continue;
  }
  const [lo, hi] = boot(xs, u);
  const diff = q(xs, 50) - q(u, 50);
  console.log(`${line}  median - U = ${diff.toFixed(1)} ms (${((diff / q(u, 50)) * 100).toFixed(1)} %), 95% CI [${lo.toFixed(1)}, ${hi.toFixed(1)}]`);
}
