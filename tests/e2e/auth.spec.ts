import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import mysql from "mysql2/promise";

/**
 * Phase 4b account pages in a real browser. Needs the app running on :3100 with a migrated
 * local MariaDB and no SMTP (emails land in .data/mail/):
 *   (.env.local: BETTER_AUTH_URL=http://localhost:3100, NLTAG_LOCAL_MAIL_OUTBOX=1, NLTAG_ACCOUNTS_ENABLED=1,
 *    AUTH_RATE_LIMIT=on, NLTAG_SIGNUP_ALLOWLIST=e2e.phone-390@nltag.test,e2e.desktop-1280@nltag.test)
 * `next start` runs in production mode, so the Phase 6a staff-only allowlist applies: the two
 * listed addresses can request an account (their old rows are removed first); any other cannot.
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
  // Listed sign-up addresses are fixed (they must be on NLTAG_SIGNUP_ALLOWLIST); start each run fresh.
  await conn.query("DELETE FROM user WHERE email LIKE 'e2e.%@nltag.test'");
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

// R4 class C (D1 mailbox-first): the create-account form asks only for the address; the emailed
// set-password link proves the mailbox and sets the first password; it never signs in.
test("request an account, choose the password from the emailed link, see the account, sign out", async ({ page }, info) => {
  const email = `e2e.${info.project.name}@nltag.test`;
  await page.goto("/en/sign-up");
  await expect(page.getByLabel(/^Password/)).toHaveCount(0); // no password on this form any more
  await page.getByLabel(/Email address/).fill(email);
  await page.waitForTimeout(1600); // human fill time; faster submissions are treated as bots
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("status")).toContainText("Check your email");
  await expect(page.getByText(/within 10 minutes/)).toBeVisible();

  // Before the link is used there is no password: sign-in fails like a wrong password.
  await page.goto("/en/sign-in");
  await page.getByLabel(/Email address/).fill(email);
  await page.getByLabel(/^Password/).fill("e2e-password-long");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("Email or password is incorrect");

  await expect.poll(() => { try { return latestLinkFor(email); } catch { return ""; } }).toMatch(/reset-password\/[A-Za-z0-9]{24}\?callbackURL=%2Fen%2Fset-password/);
  await page.goto(latestLinkFor(email));
  await page.waitForURL("**/en/set-password?token=*");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Choose your password");
  await checkPage(page);
  await page.getByLabel(/New password/).fill("e2e-password-long");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByRole("status")).toContainText("Your password is set");
  // The link did not sign anyone in.
  await page.goto("/en/account");
  await page.waitForURL("**/en/sign-in");

  await page.getByLabel(/Email address/).fill(email);
  await page.getByLabel(/^Password/).fill("e2e-password-long");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/en/account");
  await expect(page.getByText(email)).toBeVisible();
  await checkPage(page);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.waitForURL("**/en/sign-in");
  await page.goto("/en/account");
  await page.waitForURL("**/en/sign-in");
});

test("an address that is not on the allowlist gets the same message, and no email", async ({ page }, info) => {
  const email = `unlisted.${info.project.name}.${Date.now()}@nltag.test`;
  await page.goto("/en/sign-up");
  await page.getByLabel(/Email address/).fill(email);
  await page.waitForTimeout(1600);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("status")).toContainText("Check your email");
  await page.waitForTimeout(1000);
  expect(() => latestLinkFor(email)).toThrow(/no mail/);
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
