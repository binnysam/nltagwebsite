import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { hashPassword } from "better-auth/crypto";
import mysql from "mysql2/promise";
import { SEED_PASSWORD, SEED_TOTP_SECRET } from "../../scripts/db/seed-constants";
import { base32Decode, freshStep, totp, wrongCode } from "../support/totp";

/**
 * Phase 6b two-factor sign-in in a real browser at 390px and 1280px, in Tamil and English:
 * enrollment (QR, setup key, recovery codes, confirmation), the sign-in challenge with an
 * authenticator code and with a single-use recovery code, wrong codes, the Church Admin
 * requirement, turning it off; axe WCAG 2.2 AA, 44px targets, no sideways scroll.
 * Same server and seed as tests/e2e/admin.spec.ts:
 *   npm run db:migrate && npm run db:seed && scripts/serve-gallery.sh && E2E_AUTH=1 npm run test:e2e -- two-factor
 * Accounts are fictional (@nltag.test), created directly in the local database per test.
 * Review screenshots: test-results/two-factor-screens.
 */
test.describe.configure({ mode: "serial" });
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with a database-backed server");

const SHOTS = "test-results/two-factor-screens";
mkdirSync(SHOTS, { recursive: true });
const PASSWORD = "e2e-two-factor-password";

function dbUrl() {
  const url = readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)?.[1];
  if (!url || !/127\.0\.0\.1|localhost/.test(url)) throw new Error("E2E two-factor tests need a local DATABASE_URL in .env.local");
  return url;
}

async function sql<T = unknown>(query: string, params: unknown[] = []): Promise<T> {
  const conn = await mysql.createConnection({ uri: dbUrl() });
  try {
    const [rows] = await conn.query(query, params);
    return rows as T;
  } finally {
    await conn.end();
  }
}

test.beforeEach(async () => {
  await sql("DELETE FROM rate_limit");
  await sql("DELETE FROM rate_limit_bucket");
});

/** A fresh verified account (optionally a Church Admin) with no two-factor. */
async function makeUser(tag: string, roles: ("CHURCH_ADMIN" | "CONTENT_EDITOR")[] = []) {
  const email = `e2e.2fa.${tag}@nltag.test`;
  await sql("DELETE FROM user WHERE email = ?", [email]);
  const id = randomUUID();
  const now = new Date();
  await sql("INSERT INTO user (id, name, email, email_verified, two_factor_enabled, created_at, updated_at) VALUES (?, ?, ?, 1, 0, ?, ?)", [id, "Test Two-Factor E2E", email, now, now]);
  await sql("INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES (?, ?, 'credential', ?, ?, ?, ?)", [randomUUID(), id, id, await hashPassword(PASSWORD), now, now]);
  for (const role of roles) await sql("INSERT INTO staff_role (user_id, role, granted_by_user_id, granted_at) VALUES (?, ?, NULL, ?)", [id, role, now]);
  return { email, id };
}

async function checkPage(page: Page) {
  // After a client-side navigation the title arrives with streamed metadata; wait for it.
  await expect(page).toHaveTitle(/\S/);
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  const small = await page.evaluate(() =>
    // Buttons, fields and stand-alone links; links inside a sentence are exempt (WCAG 2.5.8 inline).
    [...document.querySelectorAll("main button, main input:not([type=hidden]), main a")]
      .filter((el) => !(el.matches("a") && el.closest("p")))
      .filter((el) => (el as HTMLElement).offsetParent !== null && !el.closest(".ds-visually-hidden"))
      .map((el) => (el.matches("input[type=checkbox]") ? el.closest("label") ?? el : el))
      .map((el) => ({ el: el.outerHTML.slice(0, 90), h: Math.round(el.getBoundingClientRect().height) }))
      .filter((x) => x.h < 44),
  );
  expect(small).toEqual([]);
  await expect(page.locator("h1")).toHaveCount(1);
}

const T = {
  ta: { email: /மின்னஞ்சல் முகவரி/, password: /^கடவுச்சொல்/, signIn: "உள்நுழைக", code: /6 இலக்கக் குறியீடு/, verify: "சரிபார்", recovery: /மீட்புக் குறியீட்டைப் பயன்படுத்து/, recoveryField: /^மீட்புக் குறியீடு/, cont: "தொடரவும்", saved: /சேமித்துவிட்டேன்/, turnOn: "இரு-படி உள்நுழைவை இயக்கு", off: "இரு-படி உள்நுழைவை நிறுத்து", current: /செயலியிலுள்ள குறியீடு அல்லது/, wrong: /சரியானதல்ல/ },
  en: { email: /Email address/, password: /^Password/, signIn: "Sign in", code: /6-digit code/, verify: "Verify", recovery: /Use a recovery code/, recoveryField: /^Recovery code/, cont: "Continue", saved: /I have saved my recovery codes/, turnOn: "Turn on two-factor sign-in", off: "Turn off two-factor sign-in", current: /Code from the app, or a recovery code/, wrong: /not correct/ },
} as const;

async function passwordStep(page: Page, locale: "ta" | "en", email: string, password = PASSWORD) {
  const t = T[locale];
  // All browser traffic comes from 127.0.0.1; reset the per-IP counters between sign-ins.
  await sql("DELETE FROM rate_limit");
  await page.goto(`/${locale}/sign-in`);
  await page.getByLabel(t.email).fill(email);
  await page.getByLabel(t.password).fill(password);
  await page.getByRole("button", { name: t.signIn, exact: true }).click();
  await page.waitForURL((u) => !u.pathname.endsWith("/sign-in"));
}

for (const locale of ["ta", "en"] as const) {
  test(`enroll, sign in with the app and with a recovery code, then turn off (${locale})`, async ({ page }, info) => {
    const t = T[locale];
    const p = info.project.name;
    const { email, id } = await makeUser(`${p}.${locale}`);

    // Sign in (no two-factor yet → straight to the account page), open the setup page.
    // Better Auth may land on the account or the verify-email page; either means a session exists.
    await passwordStep(page, locale, email);
    await expect(page).not.toHaveURL(/\/two-factor$/);
    await page.goto(`/${locale}/account/two-factor`);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await checkPage(page);
    await page.screenshot({ path: `${SHOTS}/1-setup-start-${locale}-${p}.png`, fullPage: true });

    // Step 1: password. Step 2: QR + setup key. Step 3: codes + confirm.
    await page.getByLabel(t.password).fill(PASSWORD);
    await page.getByRole("button", { name: t.cont }).click();
    const key = page.getByTestId("setup-key");
    await expect(key).toBeVisible();
    await expect(page.getByRole("img", { name: locale === "ta" ? /QR குறியீடு/ : /QR code/ })).toBeVisible();
    const codes = await page.getByRole("main").locator("ul li").allInnerTexts();
    const recovery = codes.filter((c) => /^[A-Za-z0-9]{5}-[A-Za-z0-9]{5}$/.test(c.trim()));
    expect(recovery).toHaveLength(10);
    await checkPage(page);
    await page.screenshot({ path: `${SHOTS}/2-setup-qr-codes-${locale}-${p}.png`, fullPage: true });
    const secret = base32Decode(await key.innerText());

    // Confirm without ticking "saved" → asked to confirm; wrong code → error; right code → on.
    await page.getByLabel(t.code).fill(totp(secret));
    await page.getByRole("button", { name: t.turnOn }).click();
    await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
    await page.getByLabel(t.saved).check();
    await page.getByLabel(t.code).fill(wrongCode(secret));
    await page.getByRole("button", { name: t.turnOn }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(t.wrong);
    await freshStep();
    await page.getByLabel(t.code).fill(totp(secret));
    await page.getByRole("button", { name: t.turnOn }).click();
    await expect(page.getByRole("main").getByRole("status").first()).toBeVisible();
    await expect(page.getByRole("button", { name: t.off })).toBeVisible();
    const [row] = await sql<{ on: number }[]>("SELECT two_factor_enabled AS `on` FROM user WHERE id = ?", [id]);
    expect(row!.on).toBe(1);
    await checkPage(page);
    await page.screenshot({ path: `${SHOTS}/3-setup-done-${locale}-${p}.png`, fullPage: true });

    // New browser context = new device: password, then the challenge.
    await page.context().clearCookies();
    await passwordStep(page, locale, email);
    await expect(page).toHaveURL(new RegExp(`/${locale}/two-factor$`));
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await checkPage(page);
    await page.screenshot({ path: `${SHOTS}/4-challenge-${locale}-${p}.png`, fullPage: true });
    // A wrong code shows an error and keeps the person here.
    await page.getByLabel(t.code).fill(wrongCode(secret));
    await page.getByRole("button", { name: t.verify }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(t.wrong);
    await expect(page).toHaveURL(/\/two-factor$/);
    await page.screenshot({ path: `${SHOTS}/5-challenge-error-${locale}-${p}.png`, fullPage: true });
    await freshStep();
    await page.getByLabel(t.code).fill(totp(secret));
    await page.getByRole("button", { name: t.verify }).click();
    await page.waitForURL(new RegExp(`/${locale}/account$`));

    // Recovery code: works once.
    await page.context().clearCookies();
    await passwordStep(page, locale, email);
    await page.getByRole("button", { name: t.recovery }).click();
    await expect(page.getByLabel(t.recoveryField)).toBeFocused();
    await checkPage(page);
    await page.screenshot({ path: `${SHOTS}/6-challenge-recovery-${locale}-${p}.png`, fullPage: true });
    await page.getByLabel(t.recoveryField).fill(recovery[0]!.trim());
    await page.getByRole("button", { name: t.verify }).click();
    await page.waitForURL(new RegExp(`/${locale}/account$`));
    await page.context().clearCookies();
    await passwordStep(page, locale, email);
    await page.getByRole("button", { name: t.recovery }).click();
    await page.getByLabel(t.recoveryField).fill(recovery[0]!.trim());
    await page.getByRole("button", { name: t.verify }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(t.wrong);

    // Sign in again and turn it off with password + code.
    await page.getByRole("button", { name: locale === "ta" ? /அங்கீகரிப்புச் செயலியைப் பயன்படுத்து/ : /authenticator app instead/ }).click();
    await freshStep();
    await page.getByLabel(t.code).fill(totp(secret));
    await page.getByRole("button", { name: t.verify }).click();
    await page.waitForURL(new RegExp(`/${locale}/account$`));
    await page.goto(`/${locale}/account/two-factor`);
    const off = page.locator("form").filter({ has: page.getByRole("button", { name: t.off }) });
    await off.getByLabel(t.password).fill(PASSWORD);
    await freshStep();
    await off.getByLabel(t.current).fill(totp(secret));
    await off.getByRole("button", { name: t.off }).click();
    await expect(page.getByRole("button", { name: t.cont })).toBeVisible();
    const [after] = await sql<{ on: number }[]>("SELECT two_factor_enabled AS `on` FROM user WHERE id = ?", [id]);
    expect(after!.on).toBe(0);
    await sql("DELETE FROM user WHERE id = ?", [id]);
  });
}

test("a Church Admin without two-factor is sent to set it up and cannot open the admin", async ({ page }, info) => {
  const { email, id } = await makeUser(`admin.${info.project.name}`, ["CHURCH_ADMIN"]);
  await passwordStep(page, "en", email);
  await page.goto("/en/account");
  // Account page: required notice.
  await expect(page.getByRole("main").getByRole("status").filter({ hasText: "Church Admins must turn on two-factor sign-in" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the admin" })).toHaveCount(0);
  // Admin pages send the person to the setup page instead.
  for (const path of ["/admin", "/admin/staff", "/admin/audit", "/admin/announcements"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/en\/account\/two-factor$/);
  }
  await expect(page.getByRole("main").getByRole("status").filter({ hasText: "Church Admins must turn on two-factor sign-in" })).toBeVisible();
  await checkPage(page);
  await page.screenshot({ path: `${SHOTS}/7-admin-required-en-${info.project.name}.png`, fullPage: true });
  const [audit] = await sql<{ k: number }[]>("SELECT COUNT(*) AS k FROM audit_log WHERE action = 'auth.2fa.required' AND actor_user_id = ?", [id]);
  expect(Number(audit!.k)).toBeGreaterThanOrEqual(4);
  await sql("DELETE FROM user WHERE id = ?", [id]);
});

test("the seeded Church Admin reaches the admin only after the code", async ({ page }, info) => {
  await page.goto("/ta/sign-in");
  await page.getByLabel(T.ta.email).fill("admin.a@nltag.test");
  await page.getByLabel(T.ta.password).fill(SEED_PASSWORD);
  await page.getByRole("button", { name: T.ta.signIn, exact: true }).click();
  await page.waitForURL(/\/ta\/two-factor$/);
  // No session yet: the admin still sends to sign-in.
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/en\/sign-in$/);
  // Fresh challenge, then the admin opens.
  await page.goto("/ta/sign-in");
  await page.getByLabel(T.ta.email).fill("admin.a@nltag.test");
  await page.getByLabel(T.ta.password).fill(SEED_PASSWORD);
  await page.getByRole("button", { name: T.ta.signIn, exact: true }).click();
  await page.waitForURL(/\/ta\/two-factor$/);
  await freshStep();
  await page.getByLabel(T.ta.code).fill(totp(SEED_TOTP_SECRET));
  await page.getByRole("button", { name: T.ta.verify }).click();
  await page.waitForURL(/\/ta\/account$/);
  await page.screenshot({ path: `${SHOTS}/8-account-2fa-on-ta-${info.project.name}.png`, fullPage: true });
  await page.goto("/admin");
  await expect(page.locator("h1")).toBeVisible();
  await expect(page).toHaveURL(/\/admin$/);
});
