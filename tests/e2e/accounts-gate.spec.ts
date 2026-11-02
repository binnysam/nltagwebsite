import { expect, test } from "@playwright/test";

/**
 * Owner decision (2 Nov 2026): with accounts switched off (the default, and production until
 * SMTP is configured and tested), every account page and the auth API return 404 and nothing
 * on the site links to them. Skipped in the E2E_AUTH run, which needs accounts switched on.
 */
test.skip(process.env.E2E_AUTH === "1", "accounts are switched on for the E2E_AUTH run");

const PAGES = ["sign-in", "sign-up", "forgot-password", "reset-password", "reset-password?token=x", "verify-email", "verify-email?error=x", "account"];

for (const locale of ["ta", "en"]) {
  for (const path of PAGES) {
    test(`/${locale}/${path} is 404 while accounts are off`, async ({ page }) => {
      const res = await page.goto(`/${locale}/${path}`);
      expect(res?.status()).toBe(404);
      await expect(page.locator("form input[type=password]")).toHaveCount(0);
    });
  }
}

test("auth API is 404 while accounts are off", async ({ request }) => {
  for (const [method, path] of [
    ["GET", "/api/auth/get-session"],
    ["GET", "/api/auth/ok"],
    ["POST", "/api/auth/sign-up/email"],
    ["POST", "/api/auth/sign-in/email"],
    ["POST", "/api/auth/request-password-reset"],
  ] as const) {
    const res = await request.fetch(path, { method, data: method === "POST" ? {} : undefined });
    expect(res.status(), `${method} ${path}`).toBe(404);
  }
});

test("homepage does not link to account pages", async ({ page }) => {
  for (const locale of ["ta", "en"]) {
    await page.goto(`/${locale}`);
    await expect(page.locator('a[href*="sign-in"], a[href*="sign-up"], a[href*="/account"]')).toHaveCount(0);
  }
});
