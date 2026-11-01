import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const run = (...args: string[]) => spawnSync("node", ["scripts/token-audit.mjs", "--json", ...args], { encoding: "utf8" });

describe("token audit", () => {
  it("passes on the source tree", () => {
    const r = run();
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).errors).toEqual([]);
  });

  it("fails on every class of violation in the fixture", () => {
    const r = run("--dir", "tests/fixtures/audit-violations");
    expect(r.status).toBe(1);
    const rules = new Set(JSON.parse(r.stdout).errors.map((e: { rule: string }) => e.rule));
    for (const rule of [
      "hardcoded-color", "raw-length", "raw-duration", "raw-z-index", "raw-radius",
      "primitive-token", "unknown-token", "raw-font-weight", "raw-shadow",
    ]) {
      expect(rules, rule).toContain(rule);
    }
  });

  it("suggests the matching token for a known raw value", () => {
    const r = run("--dir", "tests/fixtures/audit-violations");
    const color = JSON.parse(r.stdout).errors.find((e: { raw: string }) => e.raw === "#1C1915");
    expect(color.hint).toBe("var(--ink-900)");
  });
});

describe("approved tokens file", () => {
  it("is byte-identical to the Phase 1 approved tokens.final.css", () => {
    const hash = createHash("sha256").update(readFileSync("src/design-system/tokens/tokens.css")).digest("hex");
    expect(hash).toBe("909a67ca886c7ea543dddefa4cfc3388546a41e2397a7fb141d49ec1769edf58");
  });

  it("ships only the five approved gradient presets", () => {
    const css = readFileSync("src/design-system/tokens/tokens.css", "utf8");
    const presets = [...css.matchAll(/--gradient-([a-z]+):/g)].map((m) => m[1]);
    expect(presets).toEqual(["vaigarai", "manal", "kadal", "andhi", "thalir"]);
  });
});
