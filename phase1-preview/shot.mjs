import { chromium } from "@playwright/test";
const file = "file://" + process.argv[2];
const out = process.argv[3];
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await p.goto(file); await p.evaluate(() => document.fonts.ready);
await p.emulateMedia({ reducedMotion: "reduce" });
await p.screenshot({ path: out, fullPage: true });
const m = await p.evaluate(() => {
  const r = {}; const q = (s) => document.querySelector(s);
  r.scrollW = document.documentElement.scrollWidth;
  r.targets = [...document.querySelectorAll("a.btn,button,.wordmark")].map(e => { const b = e.getBoundingClientRect(); return [e.textContent.trim().slice(0,20)||e.getAttribute("aria-label"), Math.round(b.width), Math.round(b.height)]; });
  r.fonts = [...document.fonts].filter(f => f.status === "loaded").map(f => f.family + " " + f.weight).filter((v,i,a)=>a.indexOf(v)===i);
  r.h1 = getComputedStyle(q("h1")).fontSize;
  return r;
});
console.log(JSON.stringify(m, null, 1));
await b.close();
