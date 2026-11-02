import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Phase 5 public website in real Chrome at 390 and 1280 (plus 768 for screenshots):
 * every public route in Tamil and English, WCAG 2.2 AA (axe, contrast included), 44px targets,
 * no sideways scroll, one h1, noindex, hreflang, and only the hero animating.
 *
 * Two modes:
 *   - default (no database, e.g. `scripts/serve-gallery.sh`): every CMS section shows its designed
 *     empty state and the page still renders.
 *   - PUBLIC_E2E_SEEDED=1 (CI "public-browser" job, after `npm run db:seed:public`): fictional
 *     "[E2E …]" records must appear and every "[E2E hidden …]" record (draft, in review,
 *     archived, deleted, future, expired, past meeting, unpermitted testimony, unapproved contact,
 *     unverified verse text) must not.
 * Screenshots: test-results/public-screens (uploaded by CI).
 */

const SEEDED = process.env.PUBLIC_E2E_SEEDED === "1";
const SHOTS = "test-results/public-screens";
const ROUTES = ["", "/about", "/worship-times", "/sermons", "/ministries", "/testimonies", "/contact"] as const;
const LOCALES = ["ta", "en"] as const;

async function open(page: Page, path: string) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const res = await page.goto(path, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  return res;
}

async function checkQuality(page: Page) {
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll("main a, main button, header a, header button, footer a")]
      // Language-switch segments are 38px with a ::after hit area extended to 44px (approved spec).
      .filter((el) => (el as HTMLElement).offsetParent !== null && !el.closest(".ds-visually-hidden, [class*='prose'] p, [class*='prose'] li") && !el.matches("[class*='segment']"))
      .map((el) => ({ el: el.outerHTML.slice(0, 90), h: Math.round(el.getBoundingClientRect().height) }))
      .filter((x) => x.h < 44),
  );
  expect(small).toEqual([]);
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("main#main")).toHaveCount(1);
}

for (const locale of LOCALES) {
  for (const route of ROUTES) {
    const path = `/${locale}${route}`;
    test(`${path}: renders, accessible, noindex, hreflang`, async ({ page }) => {
      const res = await open(page, path);
      expect(res?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `https://nltagkuwait.com${path}`);
      await expect(page.locator('link[rel="alternate"][hreflang="ta"]')).toHaveAttribute("href", `https://nltagkuwait.com/ta${route}`);
      await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute("href", `https://nltagkuwait.com/en${route}`);
      await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute("href", `https://nltagkuwait.com/ta${route}`);
      await expect(page.getByRole("contentinfo")).toBeVisible();
      await checkQuality(page);
      // Never a street address or private data on any public page.
      const text = await page.locator("body").innerText();
      expect(text).not.toMatch(/@nltag\.test|\[E2E hidden/);
    });
  }

  test(`/${locale}: the language switch keeps the page`, async ({ page }) => {
    await open(page, `/${locale}/sermons`);
    const other = locale === "ta" ? "en" : "ta";
    await page.locator(`header a[hreflang="${other}"]`).first().click();
    await expect(page).toHaveURL(new RegExp(`/${other}/sermons$`));
  });

  test(`/${locale}: only the homepage hero animates`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(`/${locale}`, { waitUntil: "networkidle" });
    const outside = await page.evaluate(() => {
      const hero = document.querySelector("[data-hero]");
      return document.getAnimations().filter((a) => a instanceof CSSAnimation && !(a.effect instanceof KeyframeEffect && a.effect.target && hero?.contains(a.effect.target))).length;
    });
    expect(outside).toBe(0);
  });
}

test.describe("content visibility", () => {
  test.skip(SEEDED, "empty-state checks run without a database");
  test("unknown page addresses are 404", async ({ page }) => {
    expect((await page.goto("/ta/no-such-page"))?.status()).toBe(404);
    expect((await page.goto("/en/Bad_Slug"))?.status()).toBe(404);
  });

  test("every CMS section shows its designed empty state when nothing is published", async ({ page }) => {
    await open(page, "/ta");
    await expect(page.locator("[data-hero-lead]")).toHaveText("இந்த இணையதளம் தயாராகி வருகிறது.");
    expect(await page.locator("[data-empty-state]").count()).toBeGreaterThanOrEqual(5);
    await expect(page.locator("#schedule li")).toHaveCount(6); // Gate 0 schedule never depends on the CMS
    await expect(page.locator("#verse figure")).toContainText("இன்றைய வசனம் விரைவில் வெளியிடப்படும்.");
    await expect(page.locator("#visit")).toContainText("NECK");
  });
});

test.describe("published content (seeded fixtures)", () => {
  test.skip(!SEEDED, "needs PUBLIC_E2E_SEEDED=1 and npm run db:seed:public");

  test("homepage (English) shows published records and nothing else", async ({ page }) => {
    await open(page, "/en");
    await expect(page.locator("[data-hero-lead]")).toHaveText("[E2E welcome lead]");
    const main = page.locator("main");
    for (const visible of ["[E2E about]", "[E2E visible announcement]", "[E2E meeting NECK]", "[E2E meeting homes]", "[E2E meeting other]", "[E2E hall]", "[E2E ministry]", "[E2E approved contact]", "[E2E sermon]", "[E2E Speaker]", "[E2E testimony]", "[E2E Name]", "[E2E contact body]"]) {
      await expect(main, visible).toContainText(visible);
    }
    // Meeting order: soonest first; venue wording; Tamil title beneath the English one.
    const titles = await page.locator("#special-meetings h3").allInnerTexts();
    expect(titles).toEqual(["[E2E meeting NECK]", "[E2E meeting homes]", "[E2E meeting other]"]);
    await expect(page.locator("#special-meetings")).toContainText("Church members' homes");
    await expect(page.locator("#special-meetings [lang=ta]").first()).toBeVisible();
    // Verse: published reference, approved placeholder text (permission not verified).
    await expect(page.locator("#verse figure")).toContainText("[E2E Book 1:1]");
    await expect(page.locator("#verse figure")).toContainText("Verse text appears here once reproduction permission is confirmed.");
    const body = await page.locator("body").innerText();
    expect(body).not.toContain("[E2E hidden");
  });

  test("Tamil pages show the Tamil versions", async ({ page }) => {
    await open(page, "/ta");
    await expect(page.locator("[data-hero-lead]")).toHaveText("[E2E வரவேற்பு முன்னுரை]");
    await expect(page.locator("main")).toContainText("[E2E அறிவிப்பு]");
    await expect(page.locator("#special-meetings h3").first()).toHaveText("[E2E கூட்டம் NECK]");
    await open(page, "/ta/ministries");
    await expect(page.locator("main")).toContainText("[E2E ஊழியம்]");
    await expect(page.locator("main")).not.toContainText("[E2E hidden contact]");
  });

  test("dedicated pages list their records; sermon video links out safely", async ({ page }) => {
    await open(page, "/en/sermons");
    const watch = page.getByRole("link", { name: "Watch the sermon" });
    await expect(watch).toHaveAttribute("href", "https://video.example.test/e2e");
    await expect(watch).toHaveAttribute("rel", "noopener noreferrer");
    await open(page, "/en/about");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("[E2E about]");
    await expect(page.locator("main")).toContainText("[E2E about body]");
    await open(page, "/en/worship-times");
    await expect(page.locator("main")).toContainText("[E2E visible announcement]");
    await expect(page.locator("main")).not.toContainText("[E2E hidden");
    await open(page, "/en/e2e-extra-page");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("[E2E extra page]");
    expect((await page.goto("/en/e2e-hidden-page"))?.status()).toBe(404);
    expect((await page.goto("/ta/no-such-page"))?.status()).toBe(404);
    await open(page, "/en/testimonies");
    await expect(page.locator("main")).toContainText("[E2E fictional testimony]");
  });
});

test("screenshots: every public page in both languages at 390, 768 and 1280", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1280", "one project takes all three widths");
  test.setTimeout(240_000);
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: width === 768 ? 1024 : 900 });
    for (const locale of LOCALES) {
      for (const route of ROUTES) {
        await open(page, `/${locale}${route}`);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
        const name = `${locale}${route.replace("/", "-") || "-home"}-${width}`;
        await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true, animations: "disabled" });
      }
    }
  }
});
