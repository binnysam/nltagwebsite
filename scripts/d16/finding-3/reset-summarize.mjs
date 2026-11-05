// Per-class median/p90 and median difference vs U with bootstrap 95% CI (seeded). Usage: node scripts/d16/finding-3/reset-summarize.mjs <csv> <label>
import { readFileSync } from "node:fs";
const [file, label] = process.argv.slice(2);
const rows = readFileSync(file, "utf8").trim().split("\n").slice(1).map((l) => l.split(","));
const by = {}; let bad = 0;
for (const [, cls, , st, ms] of rows) { (by[cls] ??= []).push(+ms); if (st !== "200") bad++; }
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); const i = p * (s.length - 1), lo = Math.floor(i); return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo); };
let seed = 42; const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const boot = (a, b) => { const d = []; for (let i = 0; i < 4000; i++) d.push(q(a.map(() => a[Math.floor(rnd() * a.length)]), .5) - q(b.map(() => b[Math.floor(rnd() * b.length)]), .5)); return [q(d, .025), q(d, .975)]; };
console.log(`== ${label} (non-200: ${bad})`);
for (const c of Object.keys(by)) { const d = q(by[c], .5) - q(by.U, .5); const ci = c === "U" ? "" : ` diff vs U ${d >= 0 ? "+" : ""}${d.toFixed(1)} ms [${boot(by[c], by.U).map((x) => x.toFixed(1)).join(", ")}]`; console.log(`  ${c.padEnd(3)} n=${by[c].length} median ${q(by[c], .5).toFixed(1)} p90 ${q(by[c], .9).toFixed(1)}${ci}`); }
