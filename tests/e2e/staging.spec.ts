import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import sharp from "sharp";
import { base32Decode, freshStep, totp } from "../support/totp";

/**
 * Staging QA in a real browser, against a server built and started with the staging
 * configuration (NLTAG_DEPLOYMENT=staging; docs/operations/staging.md §6), its own database, media
 * folder and captured mail. Covers: environment indicator, noindex/robots, own canonical origin,
 * health, the new public pages (axe WCAG 2.2 AA, 44px, no sideways scroll, Tamil and English),
 * forms end to end, mail capture (nothing delivered), click-to-load video, and the staff flow from
 * a mailbox-first account request through two-factor, the staging admin bootstrap, roles, the
 * three inboxes (role isolation) and the gallery (upload → permission → publish → public).
 *
 *   STAGING_E2E=1 STAGING_BASE_URL=http://127.0.0.1:3200 STAGING_MAIL_DIR=… STAGING_ENV_FILE=…
 *   npx playwright test staging --project=desktop-1280   (phone-390 for the public checks)
 * Fictional data only (@nltag.test).
 */
test.describe.configure({ mode: "serial" });
test.skip(process.env.STAGING_E2E !== "1", "set STAGING_E2E=1 with a running local staging server");

const BASE = process.env.STAGING_BASE_URL ?? "http://127.0.0.1:3200";
const MAIL = process.env.STAGING_MAIL_DIR ?? "";
test.use({ baseURL: BASE });

const PASSWORD = "staging-e2e-password-long";
const LOCALES = ["ta", "en"] as const;

async function quality(page: Page) {
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll("main a, main button, main input:not([type=hidden]), main select, main textarea, header a, header button, footer a")]
      .filter((el) => (el as HTMLElement).offsetParent !== null && !el.closest(".ds-visually-hidden, [class*='prose'] p, [class*='prose'] li, p") && !el.matches("[class*='segment']"))
      .map((el) => (el.matches("input[type=checkbox]") ? el.closest("label") ?? el : el))
      .map((el) => ({ el: el.outerHTML.slice(0, 90), h: Math.round(el.getBoundingClientRect().height) }))
      .filter((x) => x.h < 44),
  );
  expect(small).toEqual([]);
  await expect(page.locator("h1")).toHaveCount(1);
}

function mailFiles(): { to: string; subject: string; text: string; capturedBy: string }[] {
  if (!MAIL || !existsSync(MAIL)) return [];
  return readdirSync(MAIL).sort().map((f) => JSON.parse(readFileSync(join(MAIL, f), "utf8")));
}
const latestLinkFor = (to: string) => {
  const m = mailFiles().reverse().find((x) => x.to === to);
  return m?.text.match(/https?:\/\/\S+/)?.[0] ?? "";
};

test.describe("environment indicator and isolation", () => {
  for (const locale of LOCALES) {
    test(`/${locale}: STAGING banner, [STAGING] title, noindex, own canonical`, async ({ page }) => {
      const res = await page.goto(`/${locale}`);
      expect(res!.status()).toBe(200);
      expect(res!.headers()["x-robots-tag"]).toMatch(/noindex/);
      await expect(page.locator("[data-environment=staging]")).toContainText("STAGING");
      await expect(page).toHaveTitle(/^\[STAGING\]/);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`^${BASE.replace(/[.:/]/g, "\\$&")}/${locale}`));
      expect(await page.locator('link[rel="canonical"]').getAttribute("href")).not.toContain("nltagkuwait.com");
    });
  }

  test("robots.txt disallows everything; health reports a verified staging deployment", async ({ request }) => {
    const robots = await request.get("/robots.txt");
    expect(await robots.text()).toContain("Disallow: /");
    const health = await (await request.get("/api/health")).json();
    expect(health).toEqual({ status: "ok", deployment: "staging", database: true, stagingVerified: true });
  });
});

test.describe("public pages added in this release", () => {
  for (const locale of LOCALES) {
    for (const path of ["/prayer", "/contact", "/testimonies/share", "/gallery", "/sermons"]) {
      test(`/${locale}${path} renders, accessible, Tamil/English`, async ({ page }) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        const res = await page.goto(`/${locale}${path}`, { waitUntil: "networkidle" });
        expect(res!.status()).toBe(200);
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await quality(page);
      });
    }
  }

  test("contact page shows the map placeholder and no map service is contacted", async ({ page }) => {
    const external: string[] = [];
    page.on("request", (r) => { if (!r.url().startsWith(BASE)) external.push(r.url()); });
    await page.goto("/en/contact", { waitUntil: "networkidle" });
    await expect(page.locator("[data-map=placeholder]")).toBeVisible();
    expect(external).toEqual([]);
  });
});

test.describe("forms (visitor)", () => {
  test("prayer: server-side errors in Tamil, then a successful anonymous request", async ({ page }) => {
    await page.goto("/ta/prayer");
    // Bypass the browser's own checks so the server's validation is what answers.
    await page.evaluate(() => document.querySelectorAll("form [required]").forEach((e) => e.removeAttribute("required")));
    await page.waitForTimeout(3200); // the signed token refuses forms sent faster than 3 s
    await page.getByRole("button", { name: "ஜெப விண்ணப்பத்தை அனுப்பு" }).click();
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page.getByText("இந்தப் புலம் அவசியம்.").first()).toBeVisible();
    await page.getByLabel(/உங்கள் ஜெப விண்ணப்பம்/).fill("[Staging QA] Please pray for the test family.");
    await page.getByLabel(/நீக்கப்படும் வரை வைத்திருக்கவும்/).check();
    await page.getByRole("button", { name: "ஜெப விண்ணப்பத்தை அனுப்பு" }).click();
    await expect(page.getByRole("status").filter({ hasText: "நன்றி" }).first()).toBeVisible();
  });

  test("contact: message stored and the notification captured, never delivered", async ({ page }) => {
    const before = mailFiles().length;
    await page.goto("/en/contact");
    await page.getByLabel(/^Your name/).fill("[Staging QA] Visitor");
    await page.getByLabel(/^Email address/).fill("visitor.qa@nltag.test");
    await page.getByLabel(/^Phone/).fill("+965 2222 3333");
    await page.getByLabel(/^Subject/).fill("[Staging QA] Visiting on Friday");
    await page.getByLabel(/^Message/).fill("Can my family visit the Friday service? [Staging QA]");
    await page.waitForTimeout(3200);
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Thank you" }).first()).toBeVisible();
    await expect.poll(() => mailFiles().length).toBeGreaterThan(before);
    const m = mailFiles().reverse().find((x) => x.to === "office@nltag.test")!;
    expect(m.capturedBy).toBe("staging");
    expect(m.subject).toMatch(/^\[STAGING\] New contact message/);
    expect(m.text).toContain("Can my family visit");
  });

  test("testimony: submitted with consent, not published", async ({ page }) => {
    await page.goto("/en/testimonies/share");
    await page.getByLabel(/^Title/).fill("[Staging QA] Testimony");
    await page.getByLabel(/^Your testimony/).fill("God answered our prayers during a difficult year. [Staging QA] fictional text.");
    await page.getByLabel(/^Show my name as/).selectOption("FIRST_NAME");
    await page.getByLabel(/^Your name/).fill("Test Person");
    await page.getByLabel(/may publish this testimony/).check();
    await page.getByLabel(/private details about other people/).check();
    await page.waitForTimeout(3200);
    await page.getByRole("button", { name: "Send testimony" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Thank you" }).first()).toBeVisible();
    await page.goto("/en/testimonies");
    await expect(page.getByText("[Staging QA] Testimony")).toHaveCount(0);
  });
});

// ── Staff flow (desktop only; serial; real mailbox-first accounts) ───────────────────────────────

const STAFF = { admin: "admin.qa@nltag.test", editor: "editor.qa@nltag.test", prayer: "prayer.qa@nltag.test" } as const;
const secrets: Partial<Record<keyof typeof STAFF, Uint8Array>> = {};

async function requestAccountAndSetPassword(page: Page, email: string) {
  await page.goto("/en/sign-up");
  await page.getByLabel(/Email address/).fill(email);
  await page.waitForTimeout(1600);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("status")).toContainText("Check your email");
  await expect.poll(() => latestLinkFor(email), { timeout: 15_000 }).toMatch(/reset-password\//);
  await page.goto(latestLinkFor(email));
  await page.getByLabel(/New password/).fill(PASSWORD);
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByRole("status")).toContainText("Your password is set");
}

async function signIn(page: Page, who: keyof typeof STAFF) {
  await page.context().clearCookies();
  await page.goto("/en/sign-in");
  await page.getByLabel(/Email address/).fill(STAFF[who]);
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.endsWith("/sign-in"));
  if (new URL(page.url()).pathname.endsWith("/two-factor")) {
    await freshStep();
    await page.getByLabel(/6-digit code/).fill(totp(secrets[who]!));
    await page.getByRole("button", { name: "Verify" }).click();
    await page.waitForURL((u) => u.pathname.endsWith("/account"));
  }
}

async function enrollTwoFactor(page: Page, who: keyof typeof STAFF) {
  await page.goto("/en/account/two-factor");
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();
  const key = page.getByTestId("setup-key");
  await expect(key).toBeVisible();
  secrets[who] = base32Decode(await key.innerText());
  await page.getByLabel(/I have saved my recovery codes/).check();
  await freshStep();
  await page.getByLabel(/6-digit code/).fill(totp(secrets[who]!));
  await page.getByRole("button", { name: "Turn on two-factor sign-in" }).click();
  await expect(page.getByRole("button", { name: "Turn off two-factor sign-in" })).toBeVisible();
}

test.describe("staff on staging", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1280, "staff flow runs once, at 1280");

  test("accounts: mailbox-first request, captured set-password link, two-factor; staging admin bootstrap", async ({ page }) => {
    test.setTimeout(240_000);
    for (const who of ["admin", "editor", "prayer"] as const) {
      await requestAccountAndSetPassword(page, STAFF[who]);
      await signIn(page, who);
      await enrollTwoFactor(page, who);
    }
    // No role yet: the admin area does not exist for them.
    await signIn(page, "admin");
    expect((await page.goto("/admin"))!.status()).toBe(404);
    // Owner step on Hostinger: NLTAG_STAGING_BOOTSTRAP_ADMIN_EMAIL for one build. Here: the same script.
    const env = Object.fromEntries(readFileSync(process.env.STAGING_ENV_FILE!, "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
    const out = execFileSync("npm", ["run", "-s", "staging:bootstrap"], { env: { ...process.env, ...env, NODE_ENV: "production", NLTAG_STAGING_BOOTSTRAP_ADMIN_EMAIL: STAFF.admin } }).toString();
    expect(out).toContain("Church Admin role granted");
    expect(out).not.toContain(STAFF.admin);
    await signIn(page, "admin");
    expect((await page.goto("/admin"))!.status()).toBe(200);
    await expect(page.locator("[data-environment=staging]")).toBeVisible();
    await expect(page).toHaveTitle(/^\[STAGING\]/);
    // Grant Content Editor and Prayer Team from the staff page.
    for (const [email, role] of [[STAFF.editor, "CONTENT_EDITOR"], [STAFF.prayer, "PRAYER_TEAM"]] as const) {
      await page.goto("/admin/staff");
      await page.getByLabel(/^Email/).fill(email);
      await page.getByLabel(/^Role/).selectOption(role);
      await page.getByRole("button", { name: /Grant/ }).click();
      await expect(page.getByRole("status").first()).toBeVisible();
    }
    await page.goto("/admin/staff");
    await expect(page.getByText("Prayer Team")).toBeVisible();
  });

  test("inboxes: prayer readable by admin and prayer team only; contact admin only; testimony accepted as a draft", async ({ page }) => {
    test.setTimeout(180_000);
    await signIn(page, "admin");
    await page.goto("/admin/prayer");
    await quality(page);
    await page.getByRole("link").filter({ hasText: /\d{4}|AM|PM/ }).first().click();
    await expect(page.getByText("[Staging QA] Please pray for the test family.")).toBeVisible();
    await page.getByRole("button", { name: "Mark as prayed for" }).click();
    await expect(page.getByRole("status").first()).toContainText("Status updated");
    await page.goto("/admin/contact");
    await quality(page);
    await page.getByRole("link", { name: "[Staging QA] Visiting on Friday" }).first().click();
    await expect(page.getByText("visitor.qa@nltag.test")).toBeVisible();
    await page.goto("/admin/testimony-submissions");
    await page.getByRole("link", { name: "[Staging QA] Testimony" }).first().click();
    await page.getByRole("button", { name: "Accept as draft" }).click();
    await expect(page.getByRole("status").first()).toContainText("not published");
    await page.getByRole("link", { name: "Open the testimony draft" }).click();
    await expect(page.getByText(/Draft/).first()).toBeVisible();

    await signIn(page, "prayer");
    expect((await page.goto("/admin/prayer"))!.status()).toBe(200);
    await expect(page.getByRole("button", { name: "Delete permanently" })).toHaveCount(0);
    for (const path of ["/admin/contact", "/admin/testimony-submissions", "/admin/pages", "/admin/media", "/admin/gallery", "/admin/staff", "/admin/audit"]) {
      expect((await page.goto(path))!.status(), path).toBe(404);
    }
    await page.goto("/admin");
    await page.waitForURL("**/admin/prayer");

    await signIn(page, "editor");
    for (const path of ["/admin/prayer", "/admin/contact", "/admin/staff"]) expect((await page.goto(path))!.status(), path).toBe(404);
    expect((await page.goto("/admin/testimony-submissions"))!.status()).toBe(200);
  });

  test("gallery: upload, permission, publish; public copy is resized WebP without metadata; unpublish hides it", async ({ page, request }) => {
    test.setTimeout(180_000);
    await signIn(page, "admin");
    const jpeg = await sharp({ create: { width: 1800, height: 1200, channels: 3, background: { r: 120, g: 160, b: 140 } } })
      .jpeg()
      .withExif({ IFD0: { Copyright: "QA-SECRET" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "29/1 22/1 0/1" } })
      .toBuffer();
    await page.goto("/admin/media");
    await page.locator("input[type=file]").setInputFiles({ name: "qa.jpg", mimeType: "image/jpeg", buffer: jpeg });
    await page.getByLabel(/English/).first().fill("[Staging QA] photo");
    await page.getByRole("button", { name: /Upload/ }).click();
    await expect(page.getByText("[Staging QA] photo").first()).toBeVisible();

    await page.goto("/admin/gallery");
    await quality(page);
    await page.getByLabel("Caption (English)").first().fill("[Staging QA] caption");
    await page.getByRole("button", { name: "Add as draft" }).click();
    await expect(page.getByRole("status").first()).toContainText("Added to the gallery");
    await page.getByRole("button", { name: "Publish" }).first().click();
    await expect(page.getByRole("alert").first()).toContainText("Record the photo permission");
    await page.getByLabel("Photo permission").first().selectOption("GRANTED");
    await page.getByLabel("Where the permission is documented").first().fill("QA consent on file (fictional)");
    await page.getByRole("button", { name: "Record permission" }).first().click();
    await page.getByRole("button", { name: "Publish" }).first().click();
    await expect(page.getByRole("status").first()).toContainText("Published");

    await page.goto("/ta/gallery", { waitUntil: "networkidle" });
    const img = page.locator("main img").first();
    await expect(img).toHaveAttribute("alt", "[Staging QA] caption");
    await quality(page);
    const src = (await img.getAttribute("src"))!;
    const bytes = Buffer.from(await (await request.get(src)).body());
    const meta = await sharp(bytes).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();
    expect(bytes.includes(Buffer.from("QA-SECRET"))).toBe(false);

    await page.goto("/admin/gallery");
    await page.getByRole("button", { name: "Unpublish" }).first().click();
    expect((await request.get(src)).status()).toBe(404);
  });

  test("captured mail: every message is marked staging and none is addressed outside the test domains", async () => {
    const all = mailFiles();
    expect(all.length).toBeGreaterThan(0);
    for (const m of all) {
      expect(m.capturedBy).toBe("staging");
      expect(m.subject.startsWith("[STAGING] ")).toBe(true);
      expect(m.to).toMatch(/@nltag\.test$/);
    }
  });
});
