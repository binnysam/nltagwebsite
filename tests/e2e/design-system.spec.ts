import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Verifies the implemented components against the approved Phase 1 specification
 * (NLTAG-PHASE-1-VISUAL-FOUNDATIONS.md) in a real browser at 390px and 1280px.
 * Expected values below are the approved token values written as computed CSS.
 */

const INK_900 = "rgb(28, 25, 21)";
const INK_800 = "rgb(52, 48, 42)";
const INK_400 = "rgb(138, 129, 117)";
const BLUE_700 = "rgb(44, 88, 120)";
const RED_700 = "rgb(163, 57, 42)";
const PAPER_50 = "rgb(250, 248, 245)";

async function open(page: Page, path: string, reducedMotion: "reduce" | "no-preference" = "reduce") {
  await page.emulateMedia({ reducedMotion });
  await page.goto(path, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
}

const css = (page: Page, selector: string, props: string[]) =>
  page.locator(selector).first().evaluate((el, ps) => {
    const s = getComputedStyle(el);
    return Object.fromEntries(ps.map((p) => [p, s.getPropertyValue(p)]));
  }, props);

for (const locale of ["ta", "en"] as const) {
  test.describe(`gallery /${locale}`, () => {
    test.beforeEach(async ({ page }) => open(page, `/${locale}/design-system`));

    test("has no horizontal scroll and sets the document language", async ({ page }) => {
      const width = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
      expect(width[0]).toBe(width[1]);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      expect(await css(page, "body", ["background-color"])).toEqual({ "background-color": PAPER_50 });
    });

    test("passes axe (WCAG 2.2 AA rules, including colour contrast on gradients)", async ({ page }) => {
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      expect(results.violations.map((v) => `${v.id} (${v.nodes.length}): ${v.nodes[0]?.target}`)).toEqual([]);
    });

    test("every interactive element is at least 44px tall and wide", async ({ page }) => {
      const small = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("main a, main button, main input, main textarea, header a, header button")]
          .filter((el) => el.offsetParent !== null && !el.classList.contains("ds-skip-link"))
          .map((el) => {
            const r = el.getBoundingClientRect();
            // Segments of the language switch extend their hit area with ::after
            const after = getComputedStyle(el, "::after");
            const extra = after.content !== "none" && after.position === "absolute" ? -2 * parseFloat(after.top || "0") : 0;
            return { text: el.textContent?.trim().slice(0, 24), w: r.width, h: r.height + extra };
          })
          .filter((r) => r.w < 44 || r.h < 44),
      );
      expect(small).toEqual([]);
    });

    test("loads the approved faces only", async ({ page }) => {
      const loaded = await page.evaluate(() =>
        [...document.fonts].filter((f) => f.status === "loaded").map((f) => `${f.family}|${f.weight}`),
      );
      const families = new Set(loaded.map((l) => l.split("|")[0]!.replace(/['"]/g, "")));
      for (const f of families) expect(f, f).toMatch(/anekTa|anekLatin|notoSans|notoSerif|interTight|inter|newsreader/i);
    });
  });
}

test.describe("component specifications (Phase 1 §6–§8)", () => {
  test.beforeEach(async ({ page }) => open(page, "/en/design-system"));

  test("primary button: pill, 44px, 14px/500, ink-900 → hover ink-800, focus ring 2px blue-700 offset 3px", async ({ page }) => {
    const btn = page.getByTestId("buttons-primary").getByRole("button").first();
    const s = await btn.evaluate((el) => {
      const c = getComputedStyle(el);
      return { bg: c.backgroundColor, radius: c.borderTopLeftRadius, h: el.getBoundingClientRect().height, size: c.fontSize, weight: c.fontWeight, px: c.paddingLeft };
    });
    expect(s).toMatchObject({ bg: INK_900, radius: "9999px", size: "14px", weight: "500", px: "20px" });
    expect(s.h).toBeGreaterThanOrEqual(44);
    await btn.hover();
    await expect(btn).toHaveCSS("background-color", INK_800);
    await page.mouse.move(0, 0);
    await btn.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(btn).toHaveCSS("outline-color", BLUE_700);
    await expect(btn).toHaveCSS("outline-width", "2px");
    await expect(btn).toHaveCSS("outline-offset", "3px");
  });

  test("secondary, compact, loading and disabled buttons", async ({ page }) => {
    const row = page.getByTestId("buttons-secondary");
    const [def, compact, loading, disabled] = await row.getByRole("button").all();
    await expect(def!).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(def!).toHaveCSS("border-top-color", "rgba(60, 42, 24, 0.18)");
    await expect(compact!).toHaveCSS("padding-left", "16px");
    await expect(loading!).toHaveAttribute("aria-busy", "true");
    // Static loading indicator: a still ring, no rotation, in either motion mode
    const ring = loading!.locator("span[aria-hidden='true']").first();
    await expect(ring).toBeVisible();
    await expect(ring).toHaveCSS("animation-name", "none");
    await expect(ring).toHaveCSS("transform", "none");
    await expect(disabled!).toBeDisabled();
    await expect(disabled!).toHaveCSS("background-color", "rgb(233, 227, 218)");
    await expect(disabled!).toHaveCSS("color", INK_400);
  });

  test("form field: 48px, radius 12, ink-400 edge, 2px red error edge with words", async ({ page }) => {
    const input = page.locator("#f-default");
    await expect(input).toHaveCSS("height", "48px");
    await expect(input).toHaveCSS("border-top-left-radius", "12px");
    await expect(input).toHaveCSS("border-top-color", INK_400);
    const error = page.locator("#f-error");
    await expect(error).toHaveCSS("border-top-color", RED_700);
    await expect(error).toHaveCSS("box-shadow", /inset/);
    await expect(page.locator("#f-error-error")).toHaveText("This field is required.");
  });

  test("verse card: radius 28, all text ink-900, Tamil first, actions outside", async ({ page }) => {
    const card = page.getByTestId("verse-compact").locator("[data-verse-card]");
    await expect(card).toHaveCSS("border-top-left-radius", "28px");
    const colors = await card.evaluate((el) =>
      [...new Set([...el.querySelectorAll("*")].filter((n) => n.textContent?.trim()).map((n) => getComputedStyle(n).color))],
    );
    expect(colors).toEqual([INK_900]);
    await expect(card.locator("blockquote").first()).toHaveAttribute("lang", "ta");
    await expect(card.getByRole("button")).toHaveCount(0);
    // Static gradient: no animation on the card
    await expect(card).toHaveCSS("animation-name", "none");
  });

  test("verse card split composition places panes side by side on wide cards only", async ({ page, viewport }) => {
    const panes = page.getByTestId("verse-split").locator("blockquote");
    const [a, b] = await Promise.all([panes.nth(0).boundingBox(), panes.nth(1).boundingBox()]);
    const cardWidth = (await page.getByTestId("verse-split").boundingBox())!.width;
    if (cardWidth >= 620) expect(Math.abs(a!.y - b!.y)).toBeLessThan(2);
    else expect(b!.y).toBeGreaterThan(a!.y + a!.height);
    expect(viewport).toBeTruthy();
  });

  test("social variants keep their 1:1 and 4:5 ratios", async ({ page }) => {
    const sq = (await page.getByTestId("verse-square").locator("[data-verse-card]").boundingBox())!;
    const pt = (await page.getByTestId("verse-portrait").locator("[data-verse-card]").boundingBox())!;
    expect(Math.abs(sq.width - sq.height)).toBeLessThan(1.5);
    expect(Math.abs(pt.height / pt.width - 1.25)).toBeLessThan(0.01);
  });

  test("reduced motion zeroes every motion token", async ({ page }) => {
    const btn = page.getByTestId("buttons-primary").getByRole("button").first();
    await expect(btn).toHaveCSS("transition-duration", /^0s(, 0s)*$/);
  });

  test("motion tokens apply when motion is allowed", async ({ page }) => {
    await open(page, "/en/design-system", "no-preference");
    const btn = page.getByTestId("buttons-primary").getByRole("button").first();
    await expect(btn).toHaveCSS("transition-duration", "0.14s, 0.14s, 0.14s, 0.08s");
  });

  test("header: sticky, white, wordmark tracking +0.08em, shadow after scrolling", async ({ page }) => {
    const header = page.locator("#site-header");
    await expect(header).toHaveCSS("position", "sticky");
    await expect(header).toHaveAttribute("data-stuck", "false");
    await page.mouse.wheel(0, 600);
    await expect(header).toHaveAttribute("data-stuck", "true");
    await expect(header).toHaveCSS("box-shadow", /rgba\(78, 50, 23, 0.04\)/);
    const mark = header.getByRole("link", { name: /NLTAG/ });
    const ls = await mark.evaluate((el) => parseFloat(getComputedStyle(el).letterSpacing) / parseFloat(getComputedStyle(el).fontSize));
    expect(ls).toBeCloseTo(0.08, 2);
  });
});

test.describe("Tamil typography rules (§4.3)", () => {
  test("Tamil display uses Anek Tamil 300, no negative tracking, own line height", async ({ page }) => {
    await open(page, "/ta/design-system");
    const h = page.locator('[lang="ta"] h4').first();
    const s = await h.evaluate((el) => {
      const c = getComputedStyle(el);
      return { family: c.fontFamily, weight: c.fontWeight, ls: c.letterSpacing, lh: parseFloat(c.lineHeight) / parseFloat(c.fontSize), tt: c.textTransform };
    });
    expect(s.family).toMatch(/anekTa/i);
    expect(s.weight).toBe("300");
    expect(s.ls === "normal" || s.ls === "0px").toBe(true);
    expect(s.lh).toBeCloseTo(1.28, 2);
    expect(s.tt).toBe("none");
  });

  test("Latin digits inside Tamil schedule text use the Tamil family's own Latin face", async ({ page }) => {
    await open(page, "/ta/design-system");
    const used = await page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family);
    });
    expect(used.some((f) => /notoSansLatin/i.test(f))).toBe(true);
  });
});

test.describe("mobile menu (< 1280px)", () => {
  test("opens with the button, closes with Escape and returns focus", async ({ page, viewport }) => {
    test.skip((viewport?.width ?? 0) >= 1280, "desktop shows inline navigation");
    await open(page, "/ta/design-system");
    const header = page.locator("#site-header");
    const button = header.getByRole("button", { name: "மெனு" });
    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    const panel = page.locator(`#${await button.getAttribute("aria-controls")}`.replace(/:/g, "\\:"));
    await expect(panel).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(header.getByRole("button", { name: "மெனு" })).toBeFocused();
  });
});

test.describe("pages", () => {
  test("/ redirects to the Tamil default locale", async ({ page }) => {
    const res = await page.goto("/");
    expect(page.url()).toMatch(/\/ta$/);
    expect(res?.status()).toBe(200);
  });

  test("pre-launch pages are noindex", async ({ page }) => {
    await page.goto("/ta");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });

  test("unknown locales return 404", async ({ page }) => {
    const res = await page.goto("/fr");
    expect(res?.status()).toBe(404);
  });
});

test.describe("visual baselines", () => {
  for (const id of ["verse-compact", "verse-square", "verse-split"]) {
    test(id, async ({ page }) => {
      await open(page, "/ta/design-system");
      await expect(page.getByTestId(id)).toHaveScreenshot(`${id}.png`);
    });
  }
  test("schedule", async ({ page }) => {
    await open(page, "/ta/design-system");
    await expect(page.locator("#schedule")).toHaveScreenshot("schedule.png");
  });
});
