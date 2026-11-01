// Builds the self-contained Phase 1 390px preview: node phase1-preview/build.ts
import { readFileSync, writeFileSync } from "node:fs";
import { schedule, formatWhen, formatWhere } from "../src/content/schedule.ts";

const root = new URL("..", import.meta.url).pathname;
const fontDir = `${root}src/design-system/fonts/files/`;
const TAMIL = "U+0964-0965,U+0B82-0BFA,U+200C-200D,U+20B9,U+25CC";
const LATIN = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";

const face = (family: string, file: string, weight: number, range: string) =>
  `@font-face{font-family:"${family}";font-weight:${weight};font-display:swap;unicode-range:${range};src:url(data:font/woff2;base64,${readFileSync(fontDir + file + ".woff2").toString("base64")}) format("woff2")}`;

const fonts = [
  face("Anek Tamil", "anek-tamil-tamil-300-normal", 300, TAMIL),
  face("Anek Tamil", "anek-tamil-latin-300-normal", 300, LATIN),
  face("Anek Tamil", "anek-tamil-tamil-400-normal", 400, TAMIL),
  face("Anek Tamil", "anek-tamil-latin-400-normal", 400, LATIN),
  face("Noto Sans Tamil", "noto-sans-tamil-tamil-400-normal", 400, TAMIL),
  face("Noto Sans Tamil", "noto-sans-tamil-latin-400-normal", 400, LATIN),
  face("Noto Sans Tamil", "noto-sans-tamil-tamil-500-normal", 500, TAMIL),
  face("Noto Sans Tamil", "noto-sans-tamil-latin-500-normal", 500, LATIN),
  face("Noto Serif Tamil", "noto-serif-tamil-tamil-400-normal", 400, TAMIL),
  face("Noto Serif Tamil", "noto-serif-tamil-latin-400-normal", 400, LATIN),
  face("Inter Tight", "inter-tight-latin-500-normal", 500, LATIN),
  face("Inter", "inter-latin-400-normal", 400, LATIN),
  face("Inter", "inter-latin-500-normal", 500, LATIN),
  face("Newsreader", "newsreader-latin-400-normal", 400, LATIN),
].join("\n");

const tokens = readFileSync(`${root}src/design-system/tokens/tokens.css`, "utf8");
const css = readFileSync(`${root}phase1-preview/preview.css`, "utf8");
const aliases = `:root{--ta-display:var(--font-ta-display);--ta-body:var(--font-ta-body);--ta-scripture:var(--font-ta-scripture);--en-display:var(--font-en-display);--en-body:var(--font-en-body);--en-scripture:var(--font-en-scripture)}`;

const rows = schedule
  .map(
    (i) => `<li><span class="s-name">${i.name.ta}</span><span class="s-alt" lang="en">${i.name.en}</span><span class="s-when">${formatWhen(i, "ta")}</span><span class="s-where">${formatWhere(i, "ta")}</span></li>`,
  )
  .join("\n      ");
const body = readFileSync(`${root}phase1-preview/body.html`, "utf8").replace("<!--ROWS-->", rows);

const script = `<script>(()=>{const h=document.querySelector('.hero'),b=document.querySelector('.hero-pause');b.addEventListener('click',()=>{const p=h.classList.toggle('paused');b.setAttribute('aria-pressed',String(p));b.setAttribute('aria-label',p?'பின்னணி அசைவைத் தொடங்கு':'பின்னணி அசைவை நிறுத்து')})})()</script>`;

const page = `<!doctype html><html lang="ta"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NLTAG 390 Preview</title><style>${fonts}\n${tokens}\n${aliases}\n${css}</style></head><body>${body}${script}</body></html>`;
writeFileSync(`${root}phase1-preview/preview-390.html`, page);
console.log("wrote preview-390.html", (page.length / 1024).toFixed(0), "KB");
