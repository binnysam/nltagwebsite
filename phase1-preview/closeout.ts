// Builds the Phase 1 close-out review page (390px preview + Tamil content review sheet).
import { readFileSync, writeFileSync } from "node:fs";
import { uiStrings } from "../src/content/ui-strings.ts";
import { schedule } from "../src/content/schedule.ts";

const root = new URL("..", import.meta.url).pathname;
const preview = readFileSync(`${root}phase1-preview/preview-390.html`, "utf8");
const tokens = readFileSync(`${root}src/design-system/tokens/tokens.css`, "utf8");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Embed the same Tamil + Latin faces the preview uses, so the review sheet renders Tamil correctly.
const faces = (preview.match(/@font-face\{[^}]+\}/g) ?? []).join("\n");

const groups: Record<string, string> = {
  nav: "Navigation", cta: "Calls to action", lang: "Language switch", hero: "Hero motion control",
  verse: "Bible verse card", schedule: "Schedule labels", status: "Membership status", form: "Forms", special: "Special meetings",
};

const extra = [
  { key: "hero.title", en: "New Life Tamil AG Church", ta: "நியூ லைஃப் தமிழ் ஏ.ஜி. சபை", alts: ["நியூ லைஃப் தமிழ் அசெம்பிளீஸ் ஆஃப் காட் சபை"], note: "Tamil rendering of the official name. Used as the preview hero heading only; the real hero copy is still CONTENT REQUIRED." },
  { key: "time.evening", en: "PM (7:00–9:30 PM gatherings)", ta: "மாலை", alts: ["இரவு"], note: "Applies to Fasting Prayer, Cottage Meeting, Ladies Meeting." },
  { key: "time.morning", en: "AM", ta: "காலை", alts: [], note: "" },
];

const row = (key: string, en: string, ta: string, alts: readonly string[], note = "", status = "Awaiting church review") =>
  `<tr><td class="k">${esc(key)}</td><td>${esc(en)}</td><td lang="ta" class="ta">${esc(ta)}</td><td lang="ta" class="alt">${alts.map(esc).join("<br>") || "—"}</td><td class="note">${esc(note)}</td><td><span class="pill">${status}</span></td></tr>`;

const sections: string[] = [];
sections.push(`<h3>Schedule names</h3><p class="sub">Times, days and NECK are confirmed (Gate 0). Only the Tamil names need review.</p><div class="tw"><table><thead><tr><th>ID</th><th>English (confirmed)</th><th>Recommended Tamil</th><th>Alternatives</th><th>Note</th><th>Status</th></tr></thead><tbody>${schedule
  .map((i) => row(i.id, i.name.en, i.name.ta, i.name.taAlternatives ?? [], i.id === "sunday-school" ? "Takes place on Friday. Avoid ஞாயிறு பள்ளி. Confirm audience (children or all ages)." : i.id === "cottage-meeting" ? "Host addresses are never published." : ""))
  .join("")}${extra.map((e) => row(e.key, e.en, e.ta, e.alts, e.note)).join("")}</tbody></table></div>`);

for (const [prefix, label] of Object.entries(groups)) {
  const entries = Object.entries(uiStrings).filter(([k]) => k.startsWith(prefix + "."));
  sections.push(`<h3>${label}</h3><div class="tw"><table><thead><tr><th>Key</th><th>English</th><th>Recommended Tamil</th><th>Alternatives</th><th>Note</th><th>Status</th></tr></thead><tbody>${entries
    .map(([k, v]) => {
      const vv = v as { en: string; ta: string; taAlternatives?: readonly string[]; note?: string; taStatus: string };
      return row(k, vv.en, vv.ta, vv.taAlternatives ?? [], vv.note ?? "", vv.taStatus === "confirmed" ? "Confirmed" : "Awaiting church review");
    })
    .join("")}</tbody></table></div>`);
}
const total = Object.values(uiStrings).filter((v) => v.taStatus !== "confirmed").length + schedule.length + extra.length;

const page = `<meta charset="utf-8">
<title>NLTAG Phase 1 Close-out</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
${faces}
${tokens}
/* Layout: phone preview on the left, findings beside it; Tamil review sheet full width below. Light only (project decision). */
body{margin:0;background:var(--color-surface-page);color:var(--color-text-primary);font-family:var(--font-en-body);font-size:var(--text-body);line-height:var(--leading-body-en)}
.wrap{max-width:var(--layout-content);margin:0 auto;padding-block:var(--space-8);padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
.eyebrow{font-size:var(--text-small);color:var(--color-text-secondary);margin:0 0 var(--space-2)}
h1{font-family:var(--font-en-display);font-weight:var(--font-weight-display-en);font-size:var(--text-display-l);line-height:var(--leading-display-en);letter-spacing:var(--tracking-display-en);margin:0 0 var(--space-4);text-wrap:balance}
h2{font-family:var(--font-en-display);font-weight:400;font-size:var(--text-h1);line-height:1.15;letter-spacing:-.015em;margin:0 0 var(--space-4)}
h3{font-family:var(--font-en-display);font-weight:500;font-size:var(--text-h3);margin:var(--space-7) 0 var(--space-2)}
.lead{font-size:var(--text-body-l);color:var(--color-text-secondary);max-width:var(--measure-en);margin:0}
.sub{color:var(--color-text-secondary);font-size:var(--text-small);margin:0 0 var(--space-3)}
.grid{display:grid;grid-template-columns:auto minmax(0,1fr);gap:var(--space-7);align-items:start;margin-top:var(--space-8)}
@media (max-width:860px){.grid{grid-template-columns:minmax(0,1fr)}}
.phone{box-sizing:border-box;width:min(414px,100%);border-radius:44px;padding:12px;background:var(--ink-900);box-shadow:var(--shadow-3)}
.grid>div{min-width:0}
.phone iframe{display:block;width:100%;height:780px;border:0;border-radius:32px;background:var(--color-surface-page)}
.cap{font-size:var(--text-small);color:var(--color-text-secondary);margin-top:var(--space-3);max-width:414px}
.checks{list-style:none;margin:0;padding:0;border-top:1px solid var(--color-border-subtle)}
.checks li{display:grid;grid-template-columns:7.5rem minmax(0,1fr);gap:var(--space-4);padding:var(--space-4) 0;border-bottom:1px solid var(--color-border-subtle)}
.checks b{font-weight:500}
.ok,.warn{justify-self:start;font-size:var(--text-caption);font-weight:500;padding:2px var(--space-3);border-radius:var(--radius-pill);height:fit-content}
.ok{color:var(--color-status-success-text);background:var(--color-status-success-surface)}
.warn{color:var(--color-status-warning-text);background:var(--color-status-warning-surface)}
.checks p{overflow-wrap:anywhere;margin:var(--space-1) 0 0;color:var(--color-text-secondary);font-size:var(--text-small)}
.review{margin-top:var(--space-9)}
.tw{overflow-x:auto;border:1px solid var(--color-border-subtle);border-radius:var(--radius-lg);background:var(--color-surface-card)}
table{border-collapse:collapse;width:100%;min-width:880px;font-size:var(--text-small)}
th{text-align:left;font-weight:500;color:var(--color-text-secondary);padding:var(--space-3) var(--space-4);border-bottom:1px solid var(--color-border-subtle);background:var(--color-surface-subtle)}
td{padding:var(--space-3) var(--space-4);border-bottom:1px solid var(--color-border-subtle);vertical-align:top}
tr:last-child td{border-bottom:0}
.k{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:var(--text-caption);color:var(--color-text-secondary);white-space:nowrap}
.ta{font-family:var(--font-ta-body);font-size:var(--text-body-ta);line-height:var(--leading-body-ta)}
.alt{font-family:var(--font-ta-body);line-height:var(--leading-body-ta);color:var(--color-text-strong-secondary)}
.note{color:var(--color-text-secondary);max-width:28ch}
.pill{display:inline-block;white-space:nowrap;font-size:var(--text-caption);font-weight:500;padding:2px var(--space-3);border-radius:var(--radius-pill);color:var(--color-status-info-text);background:var(--color-status-info-surface)}
</style>
<div class="wrap">
  <p class="eyebrow">NLTAG · Phase 1 · 1 November 2026</p>
  <h1>Phase 1 close-out: 390px preview and Tamil review sheet</h1>
  <p class="lead">The approved tokens, rendered at phone width with the real Friday-led schedule. All Tamil wording below is a draft for the church to review; nothing here is published.</p>

  <div class="grid">
    <div>
      <div class="phone"><iframe title="NLTAG 390px mobile preview" srcdoc="${esc(preview)}"></iframe></div>
      <p class="cap">Live 390px frame: scroll inside it. The hero gradient animates and has a pause button; with reduced motion it is static.</p>
    </div>
    <div>
      <h2>What was checked</h2>
      <ul class="checks">
        <li><span class="ok">Pass</span><div><b>No horizontal scroll at 390px</b><p>Page width measured at exactly 390px.</p></div></li>
        <li><span class="ok">Pass</span><div><b>Every control is at least 44px tall</b><p>Header menu 44×44, CTAs 44px+, verse actions 44px. Language segments are 38px inside a 44px control as specified; Phase 2 extends each segment's hit area to 44px.</p></div></li>
        <li><span class="ok">Pass</span><div><b>All approved faces load</b><p>Anek Tamil 300/400, Noto Sans Tamil 400/500, Noto Serif Tamil, Inter Tight 500, Inter 400/500, Newsreader. Latin characters inside Tamil text (7:30, NECK) use each family's own Latin subset.</p></div></li>
        <li><span class="ok">Pass</span><div><b>Schedule matches Gate 0</b><p>Friday 7:30–9:30 and 9:30–10:30, Saturday 7:30–8:30 PM, Tuesday 7:30–8:30 PM, last Thursday 7:00–9:00 PM. NECK written exactly. No address.</p></div></li>
        <li><span class="ok">Pass</span><div><b>Verse card shows placeholders only</b><p>Placeholder chip, placeholder text in both languages, translation labels and credit line visible. Share and Download sit outside the card.</p></div></li>
        <li><span class="warn">Review</span><div><b>Tamil "Join us this Friday" wraps to two lines</b><p>The recommended wording is long for a 390px pill (57px tall, still usable). A shorter alternative such as இந்த வெள்ளிக்கிழமை வாருங்கள் would fit one line. Church to choose.</p></div></li>
        <li><span class="warn">Review</span><div><b>Hero heading is a draft Tamil rendering of the church name</b><p>Used to test display type only. Real hero copy remains CONTENT REQUIRED.</p></div></li>
      </ul>
    </div>
  </div>

  <section class="review">
    <h2>Tamil content review sheet</h2>
    <p class="lead">${total} Tamil items await review. Each has a recommended wording and, where useful, alternatives. The church marks each item approved or replaces it; only approved items go live.</p>
    ${sections.join("\n")}
  </section>
</div>`;
writeFileSync(`${root}phase1-preview/closeout.html`, page);
console.log("closeout.html", (page.length / 1024).toFixed(0), "KB; review items:", total);
