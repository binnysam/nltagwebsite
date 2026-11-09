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

  test(`/${locale}: the desktop header stays inside the page container (1280 and 1440px)`, async ({ page }, info) => {
    test.skip(info.project.name !== "desktop-1280", "one project takes both widths");
    // Staging QA (Nov 2026): with the approved Tamil labels the header row ran 34px past the
    // 1200px container, 6px from the window edge at 1280px.
    for (const width of [1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await open(page, `/${locale}/sermons`);
      const { right, containerRight, navLinks } = await page.evaluate(() => {
        const header = document.querySelector("header")!;
        const items = [...header.querySelectorAll("a, button")].filter((e) => (e as HTMLElement).offsetParent !== null);
        const h1 = document.querySelector("main h1")!.getBoundingClientRect();
        return {
          right: Math.max(...items.map((e) => e.getBoundingClientRect().right)),
          containerRight: window.innerWidth - h1.left, // the container is centred: its right edge mirrors the content's left edge
          navLinks: header.querySelectorAll("nav a").length,
        };
      });
      expect(navLinks).toBeGreaterThanOrEqual(4);
      expect(right).toBeLessThanOrEqual(containerRight + 0.5);
    }
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

  test("unknown addresses get the site's own 404 in the URL's language (Phase A)", async ({ page }) => {
    for (const [path, h1] of [["/ta/no-such-page", "பக்கம் கிடைக்கவில்லை"], ["/en/a/b/c", "Page not found"], ["/en/sermons/no-such-sermon", "Page not found"], ["/ta/testimonies/x", "பக்கம் கிடைக்கவில்லை"]] as const) {
      expect((await open(page, path))?.status(), path).toBe(404);
      await expect(page.getByRole("heading", { level: 1 }), path).toHaveText(h1);
      await expect(page.getByRole("contentinfo"), path).toBeVisible();
    }
    await checkQuality(page);
  });

  test("the sermon search is not offered when no sermon is published (Phase A)", async ({ page }) => {
    await open(page, "/en/sermons");
    await expect(page.getByRole("search")).toHaveCount(0);
    await expect(page.locator("[data-empty-state]")).toHaveCount(1);
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

test.describe("Phase A: menu, detail pages, sermon search, 404 (seeded fixtures)", () => {
  test.skip(!SEEDED, "needs PUBLIC_E2E_SEEDED=1 and npm run db:seed:public");

  test("published public CMS pages are in the footer; unlisted, draft and reserved pages are not", async ({ page }) => {
    await open(page, "/en/sermons");
    const footer = page.getByRole("contentinfo");
    await expect(footer.getByRole("link", { name: "[E2E extra page]" })).toHaveAttribute("href", "/en/e2e-extra-page");
    await expect(footer).not.toContainText("[E2E hidden page]");
    await expect(footer).not.toContainText("[E2E welcome]");
    await expect(footer.getByRole("link", { name: "[E2E about]" })).toHaveCount(0);
    await open(page, "/ta");
    await expect(page.getByRole("contentinfo").getByRole("link", { name: "[E2E கூடுதல் பக்கம்]" })).toHaveAttribute("href", "/ta/e2e-extra-page");
  });

  test("a sermon has its own page with watch, share and back links", async ({ page }) => {
    await open(page, "/en/sermons");
    await page.getByRole("link", { name: "[E2E sermon]" }).click();
    await expect(page).toHaveURL(/\/en\/sermons\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("[E2E sermon]");
    await expect(page.locator("[data-sermon-meta]")).toContainText("[E2E Speaker]");
    await expect(page.locator("[data-sermon-meta]")).toContainText("[Book 1:1]");
    await expect(page.getByRole("link", { name: "Watch the sermon" })).toHaveAttribute("rel", "noopener noreferrer");
    await expect(page.locator("[data-share]")).toBeVisible();
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", "[E2E sermon] · NLTAG");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await checkQuality(page);
    await page.getByRole("main").getByRole("link", { name: "Sermons" }).click();
    await expect(page).toHaveURL(/\/en\/sermons$/);
  });

  test("unpublished sermons and testimonies without permission have no page", async ({ page }) => {
    await open(page, "/en/sermons");
    const href = await page.getByRole("link", { name: "[E2E sermon]" }).getAttribute("href");
    expect((await page.goto(href!.replace("/en/", "/ta/")))?.status()).toBe(200);
    for (const hidden of ["[E2E hidden draft sermon]", "[E2E hidden testimony]"]) await expect(page.locator("body")).not.toContainText(hidden);
    expect((await page.goto("/en/sermons/00000000-0000-4000-8000-000000000000"))?.status()).toBe(404);
  });

  test("a testimony has its own page with the permitted author name", async ({ page }) => {
    await open(page, "/en/testimonies");
    await page.getByRole("link", { name: "[E2E testimony]" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("[E2E testimony]");
    await expect(page.locator("[data-testimony-author]")).toHaveText("[E2E Name]");
    await expect(page.locator("main")).toContainText("[E2E fictional testimony]");
    await checkQuality(page);
  });

  test("sermon search and speaker filter work without JavaScript and say when nothing matches", async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto("/en/sermons?q=e2e+speaker");
    await expect(page.locator("main")).toContainText("[E2E sermon]");
    await page.goto("/en/sermons?q=no-such-words");
    await expect(page.locator("main")).toContainText("Nothing matches your search.");
    await expect(page.getByRole("link", { name: "Clear search" })).toHaveAttribute("href", "/en/sermons");
    await page.goto("/ta/sermons?q=" + encodeURIComponent("[E2E செய்தி]"));
    await expect(page.locator("main")).toContainText("[E2E செய்தி]");
    await ctx.close();
  });

  test("the search form submits and is accessible", async ({ page }) => {
    await open(page, "/en/sermons");
    await page.getByRole("searchbox", { name: "Search sermons" }).fill("book 1:1");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page).toHaveURL(/q=book/);
    await expect(page.locator("main")).toContainText("[E2E sermon]");
    await checkQuality(page);
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
