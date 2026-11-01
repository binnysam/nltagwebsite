import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Phase 1 §8.1: no looping motion outside the hero. Owner decision (Phase 2 review):
 * the loading indicator is static. Any keyframe animation outside the allow-list fails.
 */
const ROOT = join(__dirname, "../..");
const SRC = join(ROOT, "src");
/** Files allowed to declare @keyframes. Phase 3 adds the homepage hero only. */
const KEYFRAME_ALLOW_LIST: string[] = [];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe("motion policy", () => {
  const styleFiles = walk(SRC).filter((f) => /\.(css|tsx?)$/.test(f));

  it("declares @keyframes only in allow-listed files", () => {
    const offenders = styleFiles
      .filter((f) => /@keyframes\b/.test(readFileSync(f, "utf8")))
      .map((f) => relative(ROOT, f))
      .filter((f) => !KEYFRAME_ALLOW_LIST.includes(f));
    expect(offenders).toEqual([]);
  });

  it("has no spinner rotation token", () => {
    const tokens = readFileSync(join(SRC, "design-system/tokens/component-tokens.css"), "utf8");
    expect(tokens).not.toMatch(/--motion-spinner-cycle/);
  });
});
