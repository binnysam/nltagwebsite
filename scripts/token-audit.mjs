#!/usr/bin/env node
/**
 * NLTAG token audit (LLM-DESIGN-SYSTEMS.md §11).
 *
 * Fails (exit 1) when component code uses raw visual values instead of tokens:
 *   colours (hex/rgb/hsl), px/rem/em/ch lengths, ms/s durations, numeric z-index,
 *   numeric font-weight / line-height, literal shadows or radii, primitive-layer tokens
 *   (paper/ink/line/status/glass/hero) and next/font variables outside the token files,
 *   and var() references to tokens that do not exist.
 *
 * Token definition files are the only place raw values may live:
 *   src/design-system/tokens/tokens.css            (approved Phase 1 file, never edited)
 *   src/design-system/tokens/component-tokens.css  (layer 3)
 *
 * Reviewed exceptions: add `token-audit-ignore: <reason>` in a comment on the same line.
 * Every exception is printed in the report. Do not weaken rules to make a failure pass.
 *
 * Usage: node scripts/token-audit.mjs [--json] [--dir <folder>]
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const dirArg = process.argv.indexOf("--dir");
// --dir lets tests point the audit at a fixture folder; token files always come from src.
const src = dirArg > -1 ? join(process.cwd(), process.argv[dirArg + 1]) : join(root, "src");
const TOKEN_FILES = [
  "src/design-system/tokens/tokens.css",
  "src/design-system/tokens/component-tokens.css",
];
const asJson = process.argv.includes("--json");

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = walk(src).map((p) => relative(root, p));
const cssFiles = files.filter((f) => f.endsWith(".css") && !TOKEN_FILES.includes(f));
const tsFiles = files.filter((f) => /\.(tsx?|mjs)$/.test(f) && !f.includes("/fonts/"));

// ── Known tokens ───────────────────────────────────────────────────────────
const defined = new Set();
const collectDefs = (text) => {
  for (const m of text.matchAll(/(--[a-z0-9-]+)\s*:/gi)) defined.add(m[1]);
};
for (const f of TOKEN_FILES) collectDefs(readFileSync(join(root, f), "utf8"));
for (const f of cssFiles) collectDefs(readFileSync(join(root, f), "utf8"));

// Suggest the token whose value matches a raw value (exact matches only; ambiguity → review).
const tokenValues = new Map();
for (const f of TOKEN_FILES) {
  const text = readFileSync(join(root, f), "utf8");
  for (const m of text.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    const v = m[2].trim().toLowerCase();
    if (!tokenValues.has(v)) tokenValues.set(v, []);
    tokenValues.get(v).push(m[1]);
  }
}
const suggest = (raw) => {
  const hits = tokenValues.get(raw.toLowerCase());
  if (!hits) return "no exact token — needs design review";
  return hits.length === 1 ? `var(${hits[0]})` : `ambiguous: ${hits.join(", ")} — choose by role`;
};

const PRIMITIVE = /var\(\s*--(paper|ink|line|green|amber|red|blue|glass|hero)-[a-z0-9-]*/i;
const NEXT_FONT = /var\(\s*--nf-/i;

const findings = [];
const exceptions = [];
const add = (severity, file, line, rule, raw, hint) => findings.push({ severity, file, line, rule, raw, hint });

// ── CSS ────────────────────────────────────────────────────────────────────
for (const file of cssFiles) {
  const lines = readFileSync(join(root, file), "utf8").split("\n");
  let inComment = false;
  lines.forEach((rawLine, i) => {
    const n = i + 1;
    if (/token-audit-ignore:/.test(rawLine)) {
      exceptions.push({ file, line: n, text: rawLine.trim() });
      return;
    }
    // strip comments
    let line = rawLine;
    if (inComment) {
      const end = line.indexOf("*/");
      if (end === -1) return;
      line = line.slice(end + 2);
      inComment = false;
    }
    line = line.replace(/\/\*.*?\*\//g, "");
    const open = line.indexOf("/*");
    if (open !== -1) { inComment = true; line = line.slice(0, open); }
    if (!line.trim()) return;
    // At-rule conditions (@media (min-width: 768px), @container …) are literal by design.
    if (/^\s*@(media|container|supports)\b/.test(line)) return;

    // Unknown tokens
    for (const m of line.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) {
      if (!defined.has(m[1])) add("error", file, n, "unknown-token", m[1], "Token is not defined in the token files");
    }
    if (PRIMITIVE.test(line)) add("error", file, n, "primitive-token", line.match(PRIMITIVE)[0] + ")", "Use a semantic or component token (layers 2–3)");
    if (NEXT_FONT.test(line)) add("error", file, n, "font-variable", "--nf-*", "Use --font-stack-* tokens");

    for (const m of line.matchAll(/#[0-9a-f]{3,8}\b/gi)) add("error", file, n, "hardcoded-color", m[0], suggest(m[0]));
    for (const m of line.matchAll(/\b(rgba?|hsla?)\([^)]*\)/gi)) add("error", file, n, "hardcoded-color", m[0], suggest(m[0]));

    const decl = line.match(/^\s*([a-z-]+)\s*:\s*(.+?);?\s*$/i);
    // single-line rules such as `.a { gap: 4px; }`
    const decls = decl ? [[decl[1], decl[2]]] : [...line.matchAll(/([a-z-]+)\s*:\s*([^;{}]+)/gi)].map((m) => [m[1], m[2]]);
    for (const [prop, valueRaw] of decls) {
      if (prop.startsWith("--")) continue;
      const value = valueRaw.replace(/var\([^)]*\)/g, "V");
      for (const m of value.matchAll(/(?<![\w.-])(-?\d*\.?\d+)(px|rem|em|ch)\b/g)) {
        if (Number(m[1]) === 0) continue;
        add("error", file, n, "raw-length", `${prop}: ${m[0]}`, suggest(m[0]));
      }
      if (/^(transition|animation)/.test(prop)) {
        for (const m of value.matchAll(/(?<![\w.-])(\d*\.?\d+)(ms|s)\b/g)) {
          if (Number(m[1]) === 0) continue;
          add("error", file, n, "raw-duration", `${prop}: ${m[0]}`, suggest(m[0]));
        }
        for (const m of value.matchAll(/cubic-bezier\([^)]*\)/g)) add("error", file, n, "raw-easing", m[0], suggest(m[0]));
      }
      if (prop === "z-index" && /\d/.test(value)) add("error", file, n, "raw-z-index", value.trim(), "Use --z-* tokens");
      if (prop === "font-weight" && /\b\d{3}\b/.test(value)) add("error", file, n, "raw-font-weight", value.trim(), suggest(value.trim()));
      if (prop === "line-height" && /^\s*\d*\.?\d+\s*$/.test(value)) add("error", file, n, "raw-line-height", value.trim(), suggest(value.trim()));
      if (prop === "box-shadow" && !/V|none/.test(value)) add("error", file, n, "raw-shadow", value.trim(), "Use --shadow-* tokens");
      if (/radius/.test(prop) && !/V/.test(value) && value.trim() !== "0") add("error", file, n, "raw-radius", value.trim(), "Use --radius-* tokens");
      if (prop === "opacity" && /\d/.test(value) && !/^\s*[01]\s*$/.test(value)) add("warning", file, n, "raw-opacity", value.trim(), "Prefer an opacity token");
    }
  });
}

// ── TS/TSX: inline visual literals ─────────────────────────────────────────
for (const file of tsFiles) {
  const lines = readFileSync(join(root, file), "utf8").split("\n");
  lines.forEach((line, i) => {
    const n = i + 1;
    if (/token-audit-ignore:/.test(line)) {
      exceptions.push({ file, line: n, text: line.trim() });
      return;
    }
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
    for (const m of line.matchAll(/["'`]#[0-9a-f]{3,8}["'`]/gi)) add("error", file, n, "hardcoded-color", m[0], suggest(m[0].slice(1, -1)));
    for (const m of line.matchAll(/\b(rgba?|hsla?)\(/gi)) add("error", file, n, "hardcoded-color", m[0], "Use a colour token");
    for (const m of line.matchAll(/["'`][^"'`]*?\b\d+(px|rem)\b[^"'`]*["'`]/g)) add("error", file, n, "raw-length", m[0], "Use a space/size token via var()");
  });
}

// ── Report ─────────────────────────────────────────────────────────────────
const errors = findings.filter((f) => f.severity === "error");
const warnings = findings.filter((f) => f.severity === "warning");
if (asJson) {
  console.log(JSON.stringify({ files: cssFiles.length + tsFiles.length, errors, warnings, exceptions }, null, 2));
} else {
  console.log("TOKEN AUDIT\n");
  console.log(`Scanning ${cssFiles.length} CSS and ${tsFiles.length} TS/TSX files (token files excluded)…\n`);
  let last = "";
  for (const f of findings) {
    if (f.file !== last) { console.log(f.file); last = f.file; }
    console.log(`  ${f.severity.toUpperCase()}: line ${f.line} [${f.rule}] ${f.raw}\n    → ${f.hint}`);
  }
  if (exceptions.length) {
    console.log("\nReviewed exceptions:");
    for (const e of exceptions) console.log(`  ${e.file}:${e.line}  ${e.text}`);
  }
  console.log(`\nSUMMARY\nFiles scanned: ${cssFiles.length + tsFiles.length}\nErrors: ${errors.length}\nWarnings: ${warnings.length}\nExceptions: ${exceptions.length}\n`);
  console.log(errors.length ? "Audit failed." : "Audit passed.");
}
process.exit(errors.length ? 1 : 0);
