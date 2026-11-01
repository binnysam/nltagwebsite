// Dev helper: node scripts/shoot.mjs <path> <width> <out.png> [full]
import { chromium } from "@playwright/test";
const [, , path, width, out, full] = process.argv;
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const p = await b.newPage({ viewport: { width: Number(width), height: 900 }, deviceScaleFactor: 1 });
await p.emulateMedia({ reducedMotion: "reduce" });
await p.goto(`http://localhost:3100${path}`, { waitUntil: "networkidle" });
await p.evaluate(() => document.fonts.ready);
console.log("scrollWidth", await p.evaluate(() => document.documentElement.scrollWidth));
await p.screenshot({ path: out, fullPage: full === "full" });
await b.close();
