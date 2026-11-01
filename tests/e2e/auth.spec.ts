import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import mysql from "mysql2/promise";

/**
 * Phase 4b account pages in a real browser. Needs the app running on :3100 with a migrated
 * local MariaDB and no SMTP (emails land in .data/mail/):
 *   (.env.local: BETTER_AUTH_URL=http://localhost:3100, NLTAG_LOCAL_MAIL_OUTBOX=1)
 *   scripts/serve-gallery.sh && E2E_AUTH=1 npm run test:e2e -- auth
 * Skipped otherwise, so the design-system run does not need a database.
 */
test.describe.configure({ mode: "serial" });
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with a database-backed server");

const MAIL = join(process.cwd(), ".data", "mail");

/** Every browser test comes from 127.0.0.1, so reset the local rate-limit counters between tests. */
test.beforeEach(async () => {
  const url = readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)?.[1];
  if (!url || !/127\.0\.0\.1|localhost/.test(url)) throw new Error("E2E auth tests need a local DATABASE_URL in .env.local");
  const conn = await mysql.createConnection({ uri: url });
  await conn.query("DELETE FROM rate_limit");
  await conn.query("DELETE FROM rate_limit_bucket");
  await conn.end();
});

function latestLinkFor(to: string): string {
  const files = readdirSync(MAIL).sort().reverse();
  for (const f of files) {
    const m = JSON.parse(readFileSync(join(MAIL, f), "utf8")) as { to: string; text: string };
    if (m.to === to) return m.text.match(/https?:\/\/\S+/)![0];
  }
  throw new Error(`no mail for ${to}`);
}

async function checkPage(page: Page) {
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll("main button, main input:not(.ds-visually-hidden *)")]
      .filter((el) => !el.closest(".ds-visually-hidden"))
      .map((el) => ({ el: el.outerHTML.slice(0, 80), h: el.getBoundingClientRect().height }))
      .filter((x) => x.h < 44),
  );
  expect(small).toEqual([]);
}

for (const locale of ["ta", "en"] as const) {
  test(`sign-in and sign-up pages are accessible and private (${locale})`, async ({ page }) => {
    for (const path of ["sign-in", "sign-up", "forgot-password"]) {
      const res = await page.goto(`/${locale}/${path}`);
      expect(res!.headers()["cache-control"]).toContain("no-store");
      expect(res!.headers()["x-robots-tag"]).toContain("noindex");
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      // Page title in the page language; header with home link and language switch present.
      if (locale === "ta") await expect(page).toHaveTitle(/[\u0B80-\u0BFF]/);
      await expect(page.getByRole("link", { name: /NLTAG/ })).toHaveAttribute("href", `/${locale}`);
      await expect(page.getByRole("navigation", { name: locale === "ta" ? "மொழி" : "Language" })).toBeVisible();
      await checkPage(page);
    }
  });
}

test("sign up, verify by email link, see the account, sign out", async ({ page }, info) => {
  const email = `e2e.${info.project.name}.${Date.now()}@nltag.test`;
  await page.goto("/en/sign-up");
  await page.getByLabel(/Full name/).fill("Test Person E2E");
  await page.getByLabel(/Email address/).fill(email);
  await page.getByLabel(/^Password/).fill("e2e-password-long");
  await page.waitForTimeout(1600); // human fill time; faster submissions are treated as bots
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("status")).toContainText("Check your email");

  await page.goto("/en/sign-in");
  await page.getByLabel(/Email address/).fill(email);
  await page.getByLabel(/^Password/).fill("e2e-password-long");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("verify your email");

  await expect.poll(() => { try { return latestLinkFor(email); } catch { return ""; } }).toContain("verify-email?token=");
  await page.goto(latestLinkFor(email));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your email address is verified.");
  await page.goto("/en/account");
  await expect(page.getByText(email)).toBeVisible();
  await checkPage(page);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.waitForURL("**/en/sign-in");
  await page.goto("/en/account");
  await page.waitForURL("**/en/sign-in");
});

test("forgot password shows the same message for any address", async ({ page }) => {
  await page.goto("/ta/forgot-password");
  await page.getByLabel(/மின்னஞ்சல் முகவரி/).fill(`nobody.${Date.now()}@nltag.test`);
  await page.getByRole("button", { name: "மீட்டமைப்பு இணைப்பை அனுப்பு" }).click();
  await expect(page.getByRole("status")).toContainText("அந்த முகவரிக்கு கணக்கு இருந்தால்");
});

test("account page redirects visitors to sign-in", async ({ page }) => {
  await page.goto("/ta/account");
  await page.waitForURL("**/ta/sign-in");
});
