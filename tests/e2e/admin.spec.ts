import { mkdirSync, readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import mysql from "mysql2/promise";
import { SEED_PASSWORD, SEED_TOTP_SECRET } from "../../scripts/db/seed-constants";
import { freshStep, totp } from "../support/totp";

/**
 * Phase 4c CMS admin in a real browser at 390px and 1280px: access control, the bilingual editor,
 * the editorial workflow, XSS handling, WCAG 2.2 AA (axe), 44px targets and no sideways scroll.
 * Needs a database-backed server (same setup as tests/e2e/auth.spec.ts) with fictional data:
 *   npm run db:migrate && npm run db:seed && npm run db:seed:content
 *   scripts/serve-gallery.sh && E2E_AUTH=1 npm run test:e2e -- admin
 * Review screenshots are written to test-results/admin-screens (not baselines).
 */
test.describe.configure({ mode: "serial" });
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with a database-backed server");

const PASSWORD = SEED_PASSWORD;
const SHOTS = "test-results/admin-screens";
mkdirSync(SHOTS, { recursive: true });

test.beforeEach(async () => {
  const url = readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)?.[1];
  if (!url || !/127\.0\.0\.1|localhost/.test(url)) throw new Error("E2E admin tests need a local DATABASE_URL in .env.local");
  const conn = await mysql.createConnection({ uri: url });
  await conn.query("DELETE FROM rate_limit");
  await conn.query("DELETE FROM rate_limit_bucket");
  await conn.end();
});

async function signIn(page: Page, email: string) {
  await page.goto("/en/sign-in");
  await page.getByLabel(/Email address/).fill(email);
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Better Auth may land on the account or verify-email page; either means a session exists.
  await page.waitForURL((u) => !u.pathname.endsWith("/sign-in"));
  // Phase 6b: the seeded Church Admin has two-factor on; answer the challenge with its test app.
  if (new URL(page.url()).pathname.endsWith("/two-factor")) {
    await freshStep();
    await page.getByLabel(/6-digit code/).fill(totp(SEED_TOTP_SECRET));
    await page.getByRole("button", { name: "Verify" }).click();
    await page.waitForURL((u) => u.pathname.endsWith("/account"));
  }
}

async function checkPage(page: Page) {
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`)).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll("main button, main input:not([type=hidden]), main select, main a, header a, summary")]
      .filter((el) => (el as HTMLElement).offsetParent !== null && !el.closest(".ds-visually-hidden, dialog:not([open]), td, th, article p, article li")) // inline links in prose: WCAG 2.5.8 inline exception
      // A checkbox's target is its whole label row.
      .map((el) => (el.matches("input[type=checkbox]") ? el.closest("label") ?? el : el))
      .map((el) => ({ el: el.outerHTML.slice(0, 90), h: Math.round(el.getBoundingClientRect().height) }))
      .filter((x) => x.h < 44),
  );
  expect(small).toEqual([]);
  await expect(page.locator("h1")).toHaveCount(1);
}

const shot = (page: Page, name: string, project: string) => page.screenshot({ path: `${SHOTS}/${name}-${project}.png`, fullPage: true });

test("anonymous visitors are sent to sign-in; members get 404", async ({ page }) => {
  const res = await page.goto("/admin/announcements");
  expect(page.url()).toContain("/en/sign-in");
  expect(res!.status()).toBe(200);
  const preview = await page.request.get("/admin/preview/00000000-0000-0000-0000-000000000000", { maxRedirects: 0 });
  expect([307, 404]).toContain(preview.status());
  expect(preview.headers()["cache-control"]).toContain("no-store");
  const media = await page.request.get("/admin/media/00000000-0000-0000-0000-000000000000");
  expect(media.status()).toBe(404);

  await signIn(page, "member.c@nltag.test");
  expect((await page.goto("/admin"))!.status()).toBe(404);
  expect((await page.goto("/admin/staff"))!.status()).toBe(404);
});

test("Church Admin dashboard", async ({ page }, info) => {
  await signIn(page, "admin.a@nltag.test");
  const res = await page.goto("/admin");
  expect(res!.headers()["x-robots-tag"]).toContain("noindex");
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Coming up" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent administrative activity" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await checkPage(page);
  await shot(page, "dashboard-admin", info.project.name);
});

test("bilingual editor: create, validate, save, submit-free publish, preview", async ({ page }, info) => {
  await signIn(page, "admin.a@nltag.test");
  await page.goto("/admin/announcements/new");
  await checkPage(page);
  // Server-side validation: HTML is refused and the summary links to the field.
  await page.getByLabel("Title").first().fill("[e2e] சோதனை அறிவிப்பு");
  await page.locator("#f-en-title").fill(`[e2e] Test announcement ${info.project.name}`);
  await page.locator("#f-en-bodyMd").fill('<script>alert("x")</script>');
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("HTML is not allowed");
  await expect(page.locator("#f-en-bodyMd")).toHaveAttribute("aria-invalid", "true");
  await checkPage(page);
  await shot(page, "editor-errors", info.project.name);

  await page.locator("#f-en-bodyMd").fill("## [e2e heading]\n\nText with **bold** and a [link](https://example.org). Literal: 3 < 4 & <b>?");
  await page.locator("#f-en-bodyMd").fill("## [e2e heading]\n\nText with **bold** and a [link](https://example.org). Literal: 3 < 4 & more.");
  await page.locator("#f-ta-bodyMd").fill("[e2e] சோதனை உரை **தடித்த**");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.waitForURL(/\/admin\/announcements\/[0-9a-f-]{36}\?done=created/);
  await expect(page.locator("main").getByRole("status").filter({ hasText: "Created as a draft" })).toBeVisible();
  await expect(page.locator("#f-ta-title")).toHaveAttribute("lang", "ta");
  await checkPage(page);
  await shot(page, "editor-bilingual", info.project.name);

  await page.locator("#f-en-summary").fill("[e2e] summary");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator("main").getByRole("status").filter({ hasText: "Saved." })).toBeVisible();

  await page.getByRole("link", { name: "Preview" }).click();
  await expect(page.getByText("Preview — not public")).toBeVisible();
  await expect(page.locator("article[lang=ta]")).toContainText("தடித்த");
  await expect(page.locator("article[lang=en] strong")).toHaveText("bold");
  await expect(page.locator("article script")).toHaveCount(0);
  await checkPage(page);
  await shot(page, "preview", info.project.name);
  await page.goBack();

  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Published.", { exact: true })).toBeVisible();
  // Unpublish asks for confirmation in a modal dialog; Escape cancels.
  await page.getByRole("button", { name: "Unpublish" }).click();
  const dialog = page.getByRole("dialog", { name: /Unpublish this announcement/ });
  await expect(dialog).toBeVisible();
  await checkPage(page);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Unpublish" })).toBeFocused();
  await page.getByRole("button", { name: "Unpublish" }).click();
  await dialog.getByRole("button", { name: "Unpublish" }).click();
  await expect(page.getByText(/Unpublished\./)).toBeVisible();
});

test("Content Editor: drafts and submits; no publishing, staff or audit", async ({ page }, info) => {
  await signIn(page, "editor.b@nltag.test");
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Recent administrative activity" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Audit log" })).toHaveCount(0);
  await checkPage(page);
  await shot(page, "dashboard-editor", info.project.name);
  expect((await page.goto("/admin/staff"))!.status()).toBe(404);
  expect((await page.goto("/admin/audit"))!.status()).toBe(404);

  await page.goto("/admin/events/new");
  await page.locator("#f-en-title").fill(`[e2e] Editor meeting ${info.project.name}`);
  await page.locator("#f-detail-startsAt").fill("2031-01-09T19:30");
  await page.locator("#f-detail-locationKind").selectOption("MEMBERS_HOMES");
  await page.locator("#f-detail-locationText").fill("Block 1, Street 2");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("home address");
  await page.locator("#f-detail-locationText").fill("");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.waitForURL(/\/admin\/events\/[0-9a-f-]{36}/);
  await expect(page.getByRole("button", { name: "Publish" })).toHaveCount(0);
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByText(/Submitted for review/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
  await checkPage(page);
  await shot(page, "editor-event-submitted", info.project.name);
});

test("module lists, filters, empty states and admin-only pages are accessible", async ({ page }, info) => {
  await signIn(page, "admin.a@nltag.test");
  for (const path of ["/admin/pages", "/admin/events", "/admin/sermons", "/admin/ministries", "/admin/testimonies", "/admin/verses", "/admin/media", "/admin/staff", "/admin/audit", "/admin/review"]) {
    const res = await page.goto(path);
    expect(res!.status(), path).toBe(200);
    await checkPage(page);
  }
  await shot(page, "review", info.project.name);
  await page.goto("/admin/verses");
  await expect(page.getByText("Publishing permission verified").first()).toBeVisible();
  await shot(page, "verses", info.project.name);
  await page.goto("/admin/events");
  await expect(page.getByRole("table", { name: "Regular schedule" })).toContainText("Sunday School");
  await expect(page.getByRole("table", { name: "Regular schedule" })).toContainText("Every Friday, 9:30 – 10:30 AM");
  await shot(page, "events", info.project.name);
  await page.goto("/admin/pages?q=zzz-no-match");
  await expect(page.getByText("Nothing matches these filters.")).toBeVisible();
  await page.goto("/admin/testimonies");
  await page.getByRole("link", { name: /\[Sample testimony\]/ }).click();
  await expect(page.getByRole("button", { name: "Publish" })).toHaveCount(0);
  await expect(page.getByText("Record the author's permission before publishing")).toBeVisible();
  await checkPage(page);
  await shot(page, "testimony", info.project.name);
  // Crafted error links cannot inject wording.
  await page.goto("/admin/pages?error=Your%20account%20is%20locked");
  await expect(page.getByText("Your account is locked")).toHaveCount(0);
});

test("mobile menu works with the keyboard", async ({ page }, info) => {
  test.skip(info.project.name !== "phone-390", "phone layout only");
  await signIn(page, "admin.a@nltag.test");
  await page.goto("/admin");
  const menu = page.locator("summary", { hasText: "Menu" });
  await menu.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("navigation", { name: "Admin sections (menu)" }).getByRole("link", { name: "Sermons" })).toBeVisible();
  await shot(page, "menu-open", info.project.name);
});
