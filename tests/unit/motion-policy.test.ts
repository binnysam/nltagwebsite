import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Phase 1 §8.1: no looping motion outside the hero. Owner decision (Phase 2 review):
 * the loading indicator is static. Any keyframe animation outside the allow-list fails.
 */
const ROOT = join(__dirname, "../..");
const SRC = join(ROOT, "src");
/** Files allowed to declare @keyframes: the homepage hero only (Phase 3). */
const KEYFRAME_ALLOW_LIST: string[] = ["src/design-system/components/Hero/hero.module.css"];
/** The only keyframes the hero may declare. */
const HERO_KEYFRAMES = ["hero-field-drift", "hero-preset-crossfade"];

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

  it("the hero declares only its two approved animations, and only transform/opacity change", () => {
    const css = readFileSync(join(ROOT, KEYFRAME_ALLOW_LIST[0]!), "utf8");
    const names = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]).sort();
    expect(names).toEqual(HERO_KEYFRAMES);
    for (const block of css.matchAll(/@keyframes[^{]+\{([\s\S]*?)\n\}/g)) {
      const props = [...block[1]!.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
      expect(props.every((p) => p === "opacity" || p === "transform"), props.join(",")).toBe(true);
    }
    expect(css).not.toMatch(/filter\s*:/);
    expect(css).not.toMatch(/backdrop-filter/);
  });

  it("stops the hero under reduced motion and keeps it still until hydrated", () => {
    const css = readFileSync(join(ROOT, KEYFRAME_ALLOW_LIST[0]!), "utf8");
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.preset, \.field \{ animation: none; \}\s*\.toggle \{ display: none; \}/);
    // Default play state is paused; it runs only when ready, running and visible.
    expect(css.match(/animation-play-state: paused;/g)).toHaveLength(2);
    expect(css).toMatch(/\[data-ready="true"\]\[data-motion="running"\]\[data-visible="true"\]/);
  });

  it("uses only the five approved presets in the hero", async () => {
    const { heroPresetOrder } = await import("@/design-system/components/Hero/Hero");
    const { gradientPresets } = await import("@/design-system/components/GradientSurface");
    expect([...heroPresetOrder].sort()).toEqual([...gradientPresets].sort());
    expect(heroPresetOrder[0]).toBe("vaigarai");
  });

  it("has no spinner rotation token", () => {
    const tokens = readFileSync(join(SRC, "design-system/tokens/component-tokens.css"), "utf8");
    expect(tokens).not.toMatch(/--motion-spinner-cycle/);
  });
});
