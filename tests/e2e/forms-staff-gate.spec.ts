import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, request as pwRequest, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import mysql from "mysql2/promise";
import { SEED_PASSWORD, SEED_TOTP_SECRET } from "../../scripts/db/seed-constants";
import { freshStep, totp } from "../support/totp";

/**
 * NLTAG_PUBLIC_FORMS=staff (staging test mode, owner approval 10 Nov 2026) in a real browser:
 * visitors get 404s and no links; staff can use the forms; the prayer inbox is open to the Church
 * Admin and the Prayer Team only (no delete for Prayer Team), never to Content Editors; and replaying
 * the real form submissions (the server-action POSTs, copied from a staff page) without the right
 * session changes nothing.
 *
 * Local staging server (docs/operations/staging.md §6, with NLTAG_PUBLIC_FORMS=staff and NLTAG_DATA_KEY
 * in .env.local, database and site on 127.0.0.1). The spec gives the fictional seed accounts a
 * password, test authenticator and role in that LOCAL database only (it refuses anything else):
 *   npm run staging:init && npm run staging:seed && npx next build && npx next start -p 3200
 *   E2E_FORMS_GATE=1 STAGING_BASE_URL=http://127.0.0.1:3200 \
 *   npx playwright test --config playwright.staging-live.config.ts forms-staff-gate --project=desktop-1280
 *
 * Live staging (after the owner sets NLTAG_PUBLIC_FORMS=staff there). Sessions are the owner's own:
 * on their computer they sign in once per account and save the browser state, e.g.
 *   npx playwright open --save-storage=state/admin.json https://staging.nltagkuwait.com/en/sign-in
 * (likewise editor.json, prayer.json), then
 *   E2E_FORMS_GATE=1 FORMS_GATE_STATES=state STAGING_BASE_URL=https://staging.nltagkuwait.com \
 *   npx playwright test --config playwright.staging-live.config.ts forms-staff-gate --project=desktop-1280
 * Without FORMS_GATE_STATES only the visitor checks run. No passwords or codes are read by the spec.
 * Fictional data only ([STAGING TEST] texts); the test requests it creates are deleted at the end.
 */
test.describe.configure({ mode: "serial" });
test.skip(process.env.E2E_FORMS_GATE !== "1", "set E2E_FORMS_GATE=1 against a server with NLTAG_PUBLIC_FORMS=staff");

const STATES = process.env.FORMS_GATE_STATES;
/** Live staging (not a local staging server on 127.0.0.1). */
const LIVE = Boolean(process.env.STAGING_BASE_URL) && !/\/\/(127\.0\.0\.1|localhost)[:/]/.test(process.env.STAGING_BASE_URL ?? "");
const RUN = Date.now().toString(36);
const LOCAL_PRAYER = "prayer.p@nltag.test";
type Role = "admin" | "editor" | "prayer";
const LOCAL_EMAIL: Record<Role, string> = { admin: "admin.a@nltag.test", editor: "editor.b@nltag.test", prayer: LOCAL_PRAYER };

/** Staff sessions: saved states on live staging; seeded test accounts locally. */
const haveStaff = () => (STATES ? (["admin", "editor", "prayer"] as const).every((r) => existsSync(join(STATES, `${r}.json`))) : !LIVE);

function localEnv() {
  const text = readFileSync(".env.local", "utf8");
  const get = (k: string) => text.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim() ?? "";
  const env = { db: get("DATABASE_URL"), site: get("BETTER_AUTH_URL"), secret: get("BETTER_AUTH_SECRET") };
  // Local only: never against a database or site that is not on this machine.
  const loopback = (u: string) => /^(127\.0\.0\.1|localhost)$/.test(new URL(u).hostname);
  if (!env.db || !env.site || !loopback(env.db) || !loopback(env.site)) throw new Error("local runs need DATABASE_URL and BETTER_AUTH_URL on 127.0.0.1 in .env.local");
  return env;
}

/**
 * LOCAL database only: sign-in-able fictional test accounts with the seed's password and test
 * authenticator (the staging seed deliberately creates locked placeholders): Church Admin and
 * Prayer Team with two-factor, a Content Editor and a member without a role.
 */
async function prepareLocalAccounts() {
  const env = localEnv();
  const { hashPassword, symmetricEncrypt } = await import("better-auth/crypto");
  const hash = await hashPassword(SEED_PASSWORD);
  const secret = await symmetricEncrypt({ key: env.secret, data: SEED_TOTP_SECRET });
  const codes = await symmetricEncrypt({ key: env.secret, data: JSON.stringify(["LOCALRC-00000"]) });
  const db = await mysql.createConnection({ uri: env.db });
  try {
    await db.query("DELETE FROM rate_limit");
    await db.query("DELETE FROM rate_limit_bucket");
    const people: [string, string | null, boolean][] = [
      [LOCAL_EMAIL.admin, "CHURCH_ADMIN", true],
      [LOCAL_EMAIL.editor, "CONTENT_EDITOR", false],
      [LOCAL_EMAIL.prayer, "PRAYER_TEAM", true],
      ["member.c@nltag.test", null, false],
    ];
    for (const [email, role, twoFactor] of people) {
      await db.query("INSERT IGNORE INTO user (id, name, email, email_verified, two_factor_enabled, created_at, updated_at) VALUES (UUID(), ?, ?, 1, ?, NOW(3), NOW(3))", [`[Test] ${email}`, email, twoFactor]);
      const [[u]] = (await db.query("SELECT id FROM user WHERE email = ?", [email])) as unknown as [[{ id: string }]];
      await db.query("UPDATE user SET email_verified = 1, two_factor_enabled = ? WHERE id = ?", [twoFactor, u.id]);
      await db.query("DELETE FROM account WHERE user_id = ?", [u.id]);
      await db.query("INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES (UUID(), ?, 'credential', ?, ?, NOW(3), NOW(3))", [u.id, u.id, hash]);
      await db.query("DELETE FROM two_factor WHERE user_id = ?", [u.id]);
      if (twoFactor) await db.query("INSERT INTO two_factor (id, secret, backup_codes, user_id, verified, failed_verification_count) VALUES (UUID(), ?, ?, ?, 1, 0)", [secret, codes, u.id]);
      await db.query("DELETE FROM staff_role WHERE user_id = ?", [u.id]);
      if (role) await db.query("INSERT INTO staff_role (user_id, role, granted_by_user_id, granted_at) VALUES (?, ?, NULL, NOW(3))", [u.id, role]);
    }
  } finally {
    await db.end();
  }
}

async function signInLocal(page: Page, email: string) {
  await page.goto("/en/sign-in");
  await page.getByLabel(/Email address/).fill(email);
  await page.getByLabel(/^Password/).fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.endsWith("/sign-in"));
  if (new URL(page.url()).pathname.endsWith("/two-factor")) {
    await freshStep();
    await page.getByLabel(/6-digit code/).fill(totp(SEED_TOTP_SECRET));
    await page.getByRole("button", { name: "Verify" }).click();
    await page.waitForURL((u) => u.pathname.endsWith("/account"));
  }
}

const contexts: Partial<Record<Role | "member", BrowserContext>> = {};
async function as(browser: Browser, role: Role | "member"): Promise<Page> {
  if (!contexts[role]) {
    if (STATES && role !== "member") contexts[role] = await browser.newContext({ storageState: join(STATES, `${role}.json`) });
    else {
      contexts[role] = await browser.newContext();
      await signInLocal(await contexts[role]!.newPage(), role === "member" ? "member.c@nltag.test" : LOCAL_EMAIL[role]);
    }
  }
  return contexts[role]!.newPage();
}

/** The fields a form would post (hidden server-action fields included), read from a rendered page. */
async function formFields(page: Page, selector: string): Promise<[string, string][]> {
  return page.locator(selector).first().evaluate((f) => [...new FormData(f as HTMLFormElement).entries()].filter((e): e is [string, string] => typeof e[1] === "string"));
}

/** POSTs those fields as the browser would without JavaScript, with the given cookies (none = visitor). */
async function replay(baseURL: string, path: string, fields: [string, string][], cookies: BrowserContext | null) {
  const ctx = await pwRequest.newContext({ baseURL, extraHTTPHeaders: { Origin: new URL(baseURL).origin }, storageState: cookies ? await cookies.storageState() : undefined });
  const multipart: Record<string, string> = {};
  for (const [k, v] of fields) multipart[k] = v;
  const res = await ctx.post(path, { multipart, maxRedirects: 0, failOnStatusCode: false });
  const out = { status: res.status(), text: await res.text() };
  await ctx.dispose();
  return out;
}

/** Newest prayer request id in the admin inbox (or null). */
async function newestPrayer(page: Page): Promise<string | null> {
  await page.goto("/admin/prayer");
  await expect(page.getByRole("heading", { level: 1, name: "Prayer requests" })).toBeVisible();
  const links = page.locator("table a[href^='/admin/prayer/']");
  const href = (await links.count()) ? await links.first().getAttribute("href") : null;
  return href ? href.split("/").pop()! : null;
}

test.afterAll(async () => {
  for (const c of Object.values(contexts)) await c?.close();
});

test("visitors: form pages and the gallery are 404, no links, no contact form, admin inbox closed", async ({ page, request }) => {
  for (const locale of ["ta", "en"]) {
    for (const path of ["/prayer", "/testimonies/share", "/gallery"]) expect((await page.goto(`/${locale}${path}`))?.status(), `${locale}${path}`).toBe(404);
    await page.goto(`/${locale}/contact`);
    await expect(page.locator("#message")).toHaveCount(0);
    await expect(page.locator("form input[name='email']")).toHaveCount(0);
    await expect(page.locator(`footer a[href='/${locale}/prayer'], footer a[href='/${locale}/gallery']`)).toHaveCount(0);
    await page.goto(`/${locale}/testimonies`);
    await expect(page.locator(`a[href='/${locale}/testimonies/share']`)).toHaveCount(0);
  }
  await page.goto("/admin/prayer");
  expect(new URL(page.url()).pathname).toMatch(/\/sign-in$/);
  const img = await request.get("/gallery-image/00000000-0000-4000-8000-000000000000/960", { failOnStatusCode: false });
  expect(img.status()).toBe(404);
});

test.describe("with staff sessions", () => {
  test.skip(!haveStaff(), "needs staff sessions (local seed, or FORMS_GATE_STATES on live staging)");
  // Each two-factor sign-in waits for a fresh 30-second code window (tests/support/totp.ts).
  test.setTimeout(150_000);
  test.beforeAll(async () => {
    if (!LIVE) await prepareLocalAccounts();
  });

  let created: string | null = null;

  test("staff can use the form; replaying its POST as a visitor or member stores nothing", async ({ browser, baseURL }) => {
    const admin = await as(browser, "admin");
    const editor = await as(browser, "editor");
    expect((await editor.goto("/en/prayer"))?.status()).toBe(200);
    await expect(editor.locator("form textarea[name='body']")).toBeVisible();
    // Fields of the real form (server-action id, token), filled with a unique fictional text. Wait
    // past the minimum fill time (MIN_FILL_MS = 3 s, src/server/forms/protection.ts) so the bot
    // rule cannot be what refuses the replays: only the staff check can.
    await editor.locator("textarea[name='body']").fill(`[STAGING TEST] replayed prayer ${RUN}`);
    await editor.locator("input[name='consent']").check();
    await editor.waitForTimeout(3_500);
    const fields = await formFields(editor, "form:has(textarea[name='body'])");
    expect(fields.some(([k]) => k.startsWith("$ACTION"))).toBe(true);

    const before = await newestPrayer(admin);
    const visitor = await replay(baseURL!, "/en/prayer", fields, null);
    expect(visitor.text).not.toContain("Your prayer request has been received");
    if (!LIVE) {
      const member = await replay(baseURL!, "/en/prayer", fields, contexts.member ?? (await as(browser, "member")).context());
      expect(member.text).not.toContain("Your prayer request has been received");
    }
    expect(await newestPrayer(admin), "nothing stored by the visitor or member replays").toBe(before);

    // Control: the very same POST with the editor's session is stored, so the replay itself works
    // and the refusals above come from the staff check.
    await replay(baseURL!, "/en/prayer", fields, editor.context());
    const replayed = await newestPrayer(admin);
    expect(replayed, "the editor's replay is stored").not.toBe(before);

    // The editor's own submission through the page is accepted too.
    await editor.goto("/en/prayer");
    await editor.locator("textarea[name='body']").fill(`[STAGING TEST] staff prayer ${RUN}`);
    await editor.locator("input[name='consent']").check();
    await editor.waitForTimeout(3_500);
    await editor.getByRole("button", { name: /Send/ }).click();
    await expect(editor.getByText("Your prayer request has been received")).toBeVisible();
    created = await newestPrayer(admin);
    expect(created).not.toBe(replayed);
    // Clean up the replayed request (the page-submitted one is used and deleted below).
    await admin.goto(`/admin/prayer/${replayed}`);
    await admin.getByRole("button", { name: "Delete permanently" }).click();
    await admin.getByRole("dialog").getByRole("button", { name: "Delete permanently" }).click();
    await expect(admin).toHaveURL(/done=removed/);
  });

  test("Content Editor: prayer inbox and requests are 404; replayed status and delete POSTs change nothing", async ({ browser, baseURL }) => {
    expect(created).not.toBeNull();
    const editor = await as(browser, "editor");
    expect((await editor.goto("/admin/prayer"))?.status()).toBe(404);
    expect((await editor.goto(`/admin/prayer/${created}`))?.status()).toBe(404);
    await expect(editor.locator("body")).not.toContainText(`[STAGING TEST] staff prayer ${RUN}`);
    await expect(editor.locator("nav a[href='/admin/prayer']")).toHaveCount(0);

    const admin = await as(browser, "admin");
    await admin.goto(`/admin/prayer/${created}`);
    const statusForm = await formFields(admin, "form:has(input[name='status'][value='PRAYED'])");
    const deleteForm = await formFields(admin, "form:has(input[name='id']):not(:has(input[name='status']))");
    await replay(baseURL!, `/admin/prayer/${created}`, statusForm, editor.context());
    await replay(baseURL!, `/admin/prayer/${created}`, deleteForm, editor.context());
    await replay(baseURL!, `/admin/prayer/${created}`, deleteForm, null);
    expect((await admin.goto(`/admin/prayer/${created}`))?.status(), "still there").toBe(200);
    await expect(admin.getByText("Mark as prayed")).toBeVisible(); // status unchanged (still New)
  });

  test("Prayer Team: reads and updates status; no delete button; a replayed delete POST changes nothing", async ({ browser, baseURL }) => {
    const prayer = await as(browser, "prayer");
    expect((await prayer.goto("/admin/prayer"))?.status()).toBe(200);
    await expect(prayer.locator(`a[href='/admin/prayer/${created}']`)).toBeVisible();
    // No CMS, contact or testimony inboxes for Prayer Team.
    for (const p of ["/admin/contact", "/admin/testimony-submissions", "/admin/staff", "/admin/audit"]) expect((await prayer.goto(p))?.status(), p).toBe(404);
    await prayer.goto(`/admin/prayer/${created}`);
    await expect(prayer.getByText(`[STAGING TEST] staff prayer ${RUN}`)).toBeVisible();
    await expect(prayer.getByRole("button", { name: "Delete permanently" })).toHaveCount(0);

    const admin = await as(browser, "admin");
    await admin.goto(`/admin/prayer/${created}`);
    const deleteForm = await formFields(admin, "form:has(input[name='id']):not(:has(input[name='status']))");
    await replay(baseURL!, `/admin/prayer/${created}`, deleteForm, prayer.context());
    expect((await admin.goto(`/admin/prayer/${created}`))?.status(), "still there").toBe(200);

    await prayer.goto(`/admin/prayer/${created}`);
    await prayer.getByRole("button", { name: "Mark as prayed" }).click();
    await expect(prayer).toHaveURL(/done=status/);
  });

  test("Church Admin opens and deletes the test request", async ({ browser }) => {
    const admin = await as(browser, "admin");
    await admin.goto(`/admin/prayer/${created}`);
    await expect(admin.getByText(`[STAGING TEST] staff prayer ${RUN}`)).toBeVisible();
    await admin.getByRole("button", { name: "Delete permanently" }).click();
    await admin.getByRole("dialog").getByRole("button", { name: "Delete permanently" }).click();
    await expect(admin).toHaveURL(/done=removed/);
    expect((await admin.goto(`/admin/prayer/${created}`))?.status()).toBe(404);
  });
});
