// Renders the approved link-preview image (owner approval 10 Nov 2026, QA report §13.4) to
// public/og/nltag-share-1200x630.jpg. Tokens and the site's own font files only; nothing is
// hand-coloured. Run on the pinned Chromium so the output is reproducible:
//   scripts/pinned-chromium.sh <dir>
//   PLAYWRIGHT_BROWSERS_PATH=<dir> node scripts/render-share-image.mjs [--square-check <out.png>]
// The Tamil church name is the owner-supplied text (ownerSuppliedTamil["preview.heroTitle"]),
// reproduced exactly; the only change is a line break between "வாழ்வு" and "தமிழ்".
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL("..", import.meta.url));
const OUT = `${root}public/og/nltag-share-1200x630.jpg`;
const TAMIL_NAME = "புது வாழ்வு தமிழ் AG சபை";
const ENGLISH_NAME = "New Life Tamil AG Church";
const SITE = "nltagkuwait.com";

// The source of truth for the Tamil name: fail rather than render a different string.
const approvals = readFileSync(`${root}src/content/tamil-approvals.ts`, "utf8");
const approved = approvals.match(/"preview\.heroTitle": \{[^}]*\bta: "([^"]+)"/)?.[1];
if (approved !== TAMIL_NAME) {
  throw new Error("Tamil church name no longer matches the owner-supplied text");
}
const [line1, line2] = [TAMIL_NAME.slice(0, TAMIL_NAME.indexOf(" தமிழ்")), TAMIL_NAME.slice(TAMIL_NAME.indexOf("தமிழ்"))];

const css = ["tokens/tokens.css", "tokens/component-tokens.css"].map((f) => readFileSync(`${root}src/design-system/${f}`, "utf8")).join("\n");
const font = (family, file, weight) =>
  `@font-face{font-family:"${family}";src:url(data:font/woff2;base64,${readFileSync(`${root}src/design-system/fonts/files/${file}`).toString("base64")}) format("woff2");font-weight:${weight};}`;
const fonts = [
  font("Anek Tamil", "anek-tamil-tamil-300-normal.woff2", 300),
  font("Anek Tamil", "anek-tamil-latin-300-normal.woff2", 300),
  font("Inter Tight", "inter-tight-latin-300-normal.woff2", 300),
  font("Inter", "inter-latin-400-normal.woff2", 400),
  font("Inter", "inter-latin-500-normal.woff2", 500),
].join("\n");

const html = `<!doctype html><html lang="ta"><head><meta charset="utf-8"><style>
${fonts}
${css}
html,body{margin:0}
.card{position:relative;isolation:isolate;overflow:hidden;width:1200px;height:630px;box-sizing:border-box;
  display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;
  gap:var(--space-5);background:var(--gradient-vaigarai);color:var(--color-text-on-gradient)}
.card::after{content:"";position:absolute;inset:0;z-index:var(--z-behind);background-image:var(--texture-grain);
  background-size:var(--grain-tile-size) var(--grain-tile-size);opacity:var(--texture-grain-opacity);mix-blend-mode:var(--texture-grain-blend)}
.abbr{font-family:var(--font-en-body);font-weight:var(--font-weight-medium);font-size:var(--text-body-l)}
.ta{margin:0;font-family:var(--font-ta-display);font-weight:var(--font-weight-display-ta-large);font-size:var(--text-display-xl-ta);line-height:var(--leading-display-ta)}
.en{font-family:var(--font-en-display);font-weight:var(--font-weight-display-en);font-size:var(--text-h1)}
.site{font-family:var(--font-en-body);font-weight:var(--font-weight-body);font-size:var(--text-body)}
</style></head><body><div class="card">
<div class="abbr" lang="en">NLTAG</div>
<h1 class="ta">${line1}<br>${line2}</h1>
<div class="en" lang="en">${ENGLISH_NAME}</div>
<div class="site" lang="en">${SITE}</div>
</div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
const missing = await page.evaluate(() => ["300 10px 'Anek Tamil'", "300 10px 'Inter Tight'", "500 10px Inter"].filter((f) => !document.fonts.check(f, "அa")));
if (missing.length) throw new Error(`fonts not loaded: ${missing}`);
mkdirSync(`${root}public/og`, { recursive: true });
await page.screenshot({ path: OUT, type: "jpeg", quality: 90 });
const i = process.argv.indexOf("--square-check");
if (i > 0) await page.screenshot({ path: process.argv[i + 1], clip: { x: 285, y: 0, width: 630, height: 630 }, type: "jpeg", quality: 90 });
// Report the text block's bounds so the square-crop check is measurable, not only visual.
console.log(JSON.stringify(await page.evaluate(() => {
  const r = [...document.querySelectorAll(".card > *")].map((e) => e.getBoundingClientRect());
  return { left: Math.min(...r.map((b) => b.left)), right: Math.max(...r.map((b) => b.right)), top: Math.min(...r.map((b) => b.top)), bottom: Math.max(...r.map((b) => b.bottom)) };
})));
await browser.close();
console.log(`wrote ${OUT}`);
