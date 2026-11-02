import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Homepage hero (Phase 3): the only animated gradient. Verifies Phase 1 §8 and the Phase 3
 * motion documentation (docs/design-system/motion/motion.md) in a real browser at 390 and 1280.
 */

const BLUE_700 = "rgb(44, 88, 120)";
const INK_900: [number, number, number] = [28, 25, 21];
const CYCLE_MS = 120_000; // --motion-hero-preset-cycle (48s × 2.5)

async function open(page: Page, path: string, reducedMotion: "reduce" | "no-preference") {
  await page.emulateMedia({ reducedMotion });
  await page.goto(path, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
}

const hero = (page: Page) => page.locator("[data-hero]");

/** Animations running inside the hero, with the properties their keyframes change. */
const heroAnimations = (page: Page) =>
  page.evaluate(() => {
    const root = document.querySelector("[data-hero]")!;
    return document
      .getAnimations()
      .filter((a) => a.effect instanceof KeyframeEffect && a.effect.target && root.contains(a.effect.target))
      .map((a) => {
        const kf = (a.effect as KeyframeEffect).getKeyframes();
        const props = [...new Set(kf.flatMap((k) => Object.keys(k)))].filter(
          (p) => !["offset", "computedOffset", "easing", "composite"].includes(p),
        );
        return { name: (a as CSSAnimation).animationName, state: a.playState, props };
      });
  });

/** Sets every hero animation to the same timeline time and holds it there. */
const seek = (page: Page, ms: number) =>
  page.evaluate((t) => {
    for (const a of document.getAnimations()) {
      a.pause();
      a.currentTime = t;
    }
  }, ms);

const luminance = ([r, g, b]: number[]) => {
  const c = [r, g, b].map((v) => {
    const s = v! / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const contrast = (a: number[], b: number[]) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1! + 0.05) / (l2! + 0.05);
};

for (const locale of ["ta", "en"] as const) {
  test.describe(`homepage hero /${locale}`, () => {
    test("animates only transform and opacity, with the two approved animations", async ({ page }) => {
      await open(page, `/${locale}`, "no-preference");
      await expect(hero(page)).toHaveAttribute("data-ready", "true");
      const anims = await heroAnimations(page);
      expect(anims.filter((a) => a.name.endsWith("hero-preset-crossfade"))).toHaveLength(5);
      expect(anims.filter((a) => a.name.endsWith("hero-field-drift"))).toHaveLength(4);
      expect(anims).toHaveLength(9);
      for (const a of anims) {
        expect(a.state).toBe("running");
        expect(a.props.every((p) => p === "opacity" || p === "transform"), `${a.name}: ${a.props}`).toBe(true);
      }
    });

    test("nothing else on the page animates", async ({ page }) => {
      await open(page, `/${locale}`, "no-preference");
      const outside = await page.evaluate(() => {
        const root = document.querySelector("[data-hero]")!;
        return document
          .getAnimations()
          .filter((a) => !(a.effect instanceof KeyframeEffect && a.effect.target && root.contains(a.effect.target)))
          .filter((a) => a instanceof CSSAnimation).length;
      });
      expect(outside).toBe(0);
    });

    test("pause control: visible, labelled in the page language, keyboard operable, remembered", async ({ page }) => {
      await open(page, `/${locale}`, "no-preference");
      const labels = locale === "ta"
        ? { pause: "பின்னணி அசைவை நிறுத்து", play: "பின்னணி அசைவை தொடங்கு" }
        : { pause: "Pause background animation", play: "Play background animation" };
      const toggle = page.getByRole("button", { name: labels.pause });
      await expect(toggle).toBeVisible();
      const box = (await toggle.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);

      // keyboard: focus with Tab, show the approved ring, toggle with Space and Enter
      await toggle.focus();
      await page.keyboard.press("Tab");
      await page.keyboard.press("Shift+Tab");
      await expect(toggle).toBeFocused();
      await expect(toggle).toHaveCSS("outline-color", BLUE_700);
      await expect(toggle).toHaveCSS("outline-width", "2px");
      await page.keyboard.press("Space");
      await expect(hero(page)).toHaveAttribute("data-motion", "paused");
      const playBtn = page.getByRole("button", { name: labels.play });
      await expect(playBtn).toBeFocused();
      await expect.poll(async () => (await heroAnimations(page)).every((a) => a.state === "paused")).toBe(true);

      // remembered for the visit
      await page.reload({ waitUntil: "networkidle" });
      await expect(hero(page)).toHaveAttribute("data-motion", "paused");
      await expect.poll(async () => (await heroAnimations(page)).every((a) => a.state === "paused")).toBe(true);

      await page.getByRole("button", { name: labels.play }).focus();
      await page.keyboard.press("Enter");
      await expect(hero(page)).toHaveAttribute("data-motion", "running");
      await expect.poll(async () => (await heroAnimations(page)).every((a) => a.state === "running")).toBe(true);
    });

    test("passes axe (WCAG 2.2 AA) while moving and while paused", async ({ page }) => {
      await open(page, `/${locale}`, "no-preference");
      const run = async () =>
        (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations.map(
          (v) => `${v.id} (${v.nodes.length}): ${v.nodes[0]?.target}`,
        );
      expect(await run()).toEqual([]);
      await page.locator("[data-hero-toggle]").click();
      expect(await run()).toEqual([]);
    });

    test("text keeps WCAG AA contrast at every point of the cycle", async ({ page, browser }) => {
      await open(page, `/${locale}`, "no-preference");
      // Hide the text and the controls so only the background behind the text is measured.
      await page.addStyleTag({ content: "[data-hero] h1, [data-hero] p, [data-hero] span[lang], [data-hero] a, [data-hero] button { color: transparent !important; background: transparent !important; border-color: transparent !important; box-shadow: none !important; }" });
      const targets = ["[data-hero] h1", "[data-hero] p", "[data-hero] span[lang]"];
      const decoder = await browser.newPage();
      let worst = Infinity;
      for (let t = 0; t < CYCLE_MS; t += CYCLE_MS / 40) {
        await seek(page, t);
        for (const sel of targets) {
          const png = await page.locator(sel).first().screenshot({ animations: "allow", scale: "css" });
          const darkest: number[] = await decoder.evaluate(async (b64) => {
            const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
            const bmp = await createImageBitmap(blob);
            const c = new OffscreenCanvas(bmp.width, bmp.height);
            const ctx = c.getContext("2d")!;
            ctx.drawImage(bmp, 0, 0);
            const d = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
            let best = [255, 255, 255];
            let bestL = Infinity;
            for (let i = 0; i < d.length; i += 4) {
              const l = 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
              if (l < bestL) { bestL = l; best = [d[i]!, d[i + 1]!, d[i + 2]!]; }
            }
            return best;
          }, png.toString("base64"));
          worst = Math.min(worst, contrast(INK_900, darkest));
        }
      }
      await decoder.close();
      // ink-900 text: Phase 1 measured ≥ 6.55:1 on every preset with grain. Require AA (4.5:1) with margin.
      test.info().annotations.push({ type: "worst-contrast", description: worst.toFixed(2) });
      expect(worst).toBeGreaterThanOrEqual(6);
    });
  });
}

test.describe("homepage hero — reduced motion and no JavaScript", () => {
  test("reduced motion: still Vaigarai frame, no animations, no control", async ({ page }) => {
    await open(page, "/ta", "reduce");
    expect(await heroAnimations(page)).toEqual([]);
    await expect(page.locator("[data-hero-toggle]")).toBeHidden();
    await expect(page.locator('[data-hero-preset="vaigarai"]')).toHaveCSS("opacity", "1");
    for (const p of ["andhi", "kadal", "thalir", "manal"]) {
      await expect(page.locator(`[data-hero-preset="${p}"]`)).toHaveCSS("opacity", "0");
    }
  });

  test("switching to reduced motion while the page is open stops the hero", async ({ page }) => {
    await open(page, "/en", "no-preference");
    expect(await heroAnimations(page)).toHaveLength(9);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect.poll(async () => (await heroAnimations(page)).length).toBe(0);
    await expect(page.locator("[data-hero-toggle]")).toBeHidden();
  });

  test("without JavaScript the hero is still and all content is visible", async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto("/ta");
    await expect(hero(page)).toHaveAttribute("data-ready", "false");
    await expect(page.locator("[data-hero] h1")).toHaveText("புது வாழ்வு தமிழ் AG சபை");
    await expect(page.locator("[data-hero] a")).toBeVisible();
    await expect(page.locator("[data-hero-toggle]")).toHaveCount(0);
    const states = await page.evaluate(() =>
      [...document.querySelectorAll("[data-hero-preset], [data-hero-field]")].map((el) => getComputedStyle(el).animationPlayState),
    );
    expect(states.length).toBe(9);
    expect(states.every((s) => s === "paused")).toBe(true);
    await ctx.close();
  });
});

test.describe("homepage hero — performance guards", () => {
  test("pauses while scrolled out of view and resumes when back", async ({ page }) => {
    await open(page, "/en", "no-preference");
    await page.evaluate(() => (document.body.style.paddingBottom = "300vh"));
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(hero(page)).toHaveAttribute("data-visible", "false");
    await expect.poll(async () => (await heroAnimations(page)).every((a) => a.state === "paused")).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(hero(page)).toHaveAttribute("data-visible", "true");
    await expect.poll(async () => (await heroAnimations(page)).every((a) => a.state === "running")).toBe(true);
  });

  test("no layout shift from hero motion or the control; load shift stays negligible", async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __shifts: { t: number; v: number }[] };
      w.__shifts = [];
      new PerformanceObserver((l) => {
        for (const e of l.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
          if (!e.hadRecentInput) w.__shifts.push({ t: e.startTime, v: e.value });
        }
      }).observe({ type: "layout-shift", buffered: true });
    });
    await open(page, "/ta", "no-preference");
    const settled = await page.evaluate(() => performance.now());
    await page.waitForTimeout(2000); // hero running
    await page.locator("[data-hero-toggle]").click();
    await page.waitForTimeout(300);
    await page.locator("[data-hero-toggle]").click();
    await page.waitForTimeout(500);
    const shifts = await page.evaluate(() => (window as unknown as { __shifts: { t: number; v: number }[] }).__shifts);
    // After fonts are ready, motion and the control must never move layout.
    expect(shifts.filter((s) => s.t > settled)).toEqual([]);
    // During load (font swap) the total must stay far below the 0.1 "good" threshold.
    expect(shifts.reduce((a, s) => a + s.v, 0)).toBeLessThan(0.01);
  });

  test("hero has no horizontal overflow and keeps the control clear of content", async ({ page }) => {
    await open(page, "/ta", "no-preference");
    const width = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(width[0]).toBe(width[1]);
    const btn = (await page.locator("[data-hero-toggle]").boundingBox())!;
    for (const sel of ["[data-hero] h1", "[data-hero] p", "[data-hero] a"]) {
      const b = (await page.locator(sel).first().boundingBox())!;
      const overlap = !(b.x + b.width <= btn.x || btn.x + btn.width <= b.x || b.y + b.height <= btn.y || btn.y + btn.height <= b.y);
      expect(overlap, sel).toBe(false);
    }
  });
});

test.describe("visual baselines", () => {
  test("hero still frame", async ({ page }) => {
    await open(page, "/ta", "reduce");
    await expect(hero(page)).toHaveScreenshot("hero-still.png");
  });
});
