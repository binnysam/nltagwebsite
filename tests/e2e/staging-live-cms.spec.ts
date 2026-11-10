import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import sharp from "sharp";
import { base32Decode, freshStep, totp } from "../support/totp";

/**
 * Live CMS acceptance on https://staging.nltagkuwait.com (Nov 2026). Runs only against the staging
 * origin, only with fictional staff accounts (…@nltag.test), and only with fictional content
 * marked "[E2E LIVE <run>]". Everything it creates is unpublished and deleted again at the end
 * (CMS delete: hidden from the website and lists; restorable from the Deleted filter).
 *
 * Credentials come from the environment and are never printed, written to a file or put in a URL:
 *   STAGING_LIVE_CMS=1
 *   STAGING_ADMIN_EMAIL=admin@nltag.test  STAGING_ADMIN_PASSWORD=…  STAGING_ADMIN_TOTP_KEY=<setup key>
 *   optional, for the role checks: STAGING_EDITOR_* and STAGING_PRAYER_* (same three variables)
 *   npx playwright test --config playwright.staging-live.config.ts staging-live-cms --project desktop-1280 --trace off
 * Traces, videos and screenshots stay off for this file (the sign-in form would be recorded).
 */
test.describe.configure({ mode: "serial" });
test.skip(process.env.STAGING_LIVE_CMS !== "1", "set STAGING_LIVE_CMS=1 and the staging staff credentials");
test.use({ trace: "off", video: "off", screenshot: "off" });

const STAGING_ORIGIN = "https://staging.nltagkuwait.com";
const RUN = `${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`;
const MARK = `[E2E LIVE ${RUN}]`;

type Staff = { email: string; password: string; key: Uint8Array };
function staff(prefix: "ADMIN" | "EDITOR" | "PRAYER"): Staff | null {
  const email = process.env[`STAGING_${prefix}_EMAIL`] ?? "";
  const password = process.env[`STAGING_${prefix}_PASSWORD`] ?? "";
  const key = process.env[`STAGING_${prefix}_TOTP_KEY`] ?? "";
  if (!email || !password || !key) return null;
  // Fictional staging accounts only: a real address is refused before anything is sent.
  if (!/@nltag\.test$/i.test(email)) throw new Error(`STAGING_${prefix}_EMAIL must be a reserved …@nltag.test address`);
  return { email, password, key: base32Decode(key) };
}
const ADMIN = staff("ADMIN");
const EDITOR = staff("EDITOR");
const PRAYER = staff("PRAYER");

/** Created records, removed again by the cleanup test (and by afterAll if a test failed). */
const created: { segment: string; id: string }[] = [];
const mediaAlt = `${MARK} photo`;
/** The media test's upload is still in the library (removed by the test itself, else by afterAll). */
let mediaPending = false;
/** Records clean-up did not touch or could not remove: printed for manual review (ids only). */
const needsReview: string[] = [];

test.beforeAll(({}, info) => {
  const base = String(info.project.use.baseURL ?? "");
  // Never production, never anything but the staging origin.
  if (new URL(base).origin !== STAGING_ORIGIN) throw new Error("staging-live-cms runs only against the staging origin");
  if (process.env.STAGING_LIVE_CMS === "1" && !ADMIN) throw new Error("STAGING_ADMIN_EMAIL, STAGING_ADMIN_PASSWORD and STAGING_ADMIN_TOTP_KEY are required");
});

async function signIn(page: Page, who: Staff) {
  await page.goto("/en/sign-in");
  // Fail closed before any credential is typed: the page must be the staging origin.
  expect(new URL(page.url()).origin).toBe(STAGING_ORIGIN);
  await page.getByLabel(/Email address/).fill(who.email);
  await page.getByLabel(/^Password/).fill(who.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.endsWith("/sign-in"), { timeout: 60_000 });
  // Staff accounts have two-factor on: the password alone never opens a session.
  expect(new URL(page.url()).pathname).toBe("/en/two-factor");
  const half = await page.request.get("/admin", { maxRedirects: 0 });
  expect(half.status()).toBe(307);
  expect(half.headers()["location"]).toContain("/sign-in");
  await freshStep();
  await page.getByLabel(/6-digit code/).fill(totp(who.key));
  await page.getByRole("button", { name: "Verify" }).click();
  await page.waitForURL((u) => u.pathname.endsWith("/account"), { timeout: 60_000 });
}

async function axeClean(page: Page) {
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
}

/** Opens `/admin/<segment>/new`, fills both languages and saves; returns the new id. */
async function createDraft(page: Page, segment: string, fill: (page: Page) => Promise<void>) {
  await page.goto(`/admin/${segment}/new`);
  await fill(page);
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.waitForURL(new RegExp(`/admin/${segment}/[0-9a-f-]{36}`));
  const id = new URL(page.url()).pathname.split("/").pop()!;
  created.push({ segment, id });
  await expect(page.locator("main").getByRole("status").filter({ hasText: "Created as a draft" })).toBeVisible();
  return id;
}

async function publish(page: Page) {
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Published.", { exact: true })).toBeVisible();
}

async function unpublish(page: Page, singular: string) {
  await page.getByRole("button", { name: "Unpublish" }).click();
  await page.getByRole("dialog", { name: new RegExp(`Unpublish this ${singular}`) }).getByRole("button", { name: "Unpublish" }).click();
  await expect(page.getByText(/Unpublished\./)).toBeVisible();
}

/**
 * True only when the admin page of this id is a record of THIS run: its own English or Tamil title
 * field starts with the run's unique marker (`[E2E LIVE <run>]`). Anything else (another run, seeded
 * or church content, a page that does not open) is not ours.
 */
async function ownedByThisRun(page: Page, segment: string, id: string): Promise<boolean> {
  const res = await page.goto(`/admin/${segment}/${id}`);
  if (!res || res.status() !== 200) return false;
  for (const sel of ["#f-en-title", "#f-ta-title"]) {
    const field = page.locator(sel);
    if ((await field.count()) && (await field.inputValue()).startsWith(MARK)) return true;
  }
  return false;
}

/**
 * Unpublishes (if needed) and deletes every record this run created, newest first. Never touches
 * anything else: a record whose ownership cannot be confirmed is skipped and reported for manual
 * review, and so is one that could not be removed. Ids only in the report; never titles or text.
 */
async function cleanUp(page: Page) {
  while (created.length) {
    const { segment, id } = created.pop()!;
    try {
      if (!(await ownedByThisRun(page, segment, id))) {
        needsReview.push(`/admin/${segment}/${id}: not confirmed as this run's record; left untouched`);
        continue;
      }
      if (!(await page.getByText("This item is deleted.").count())) {
        const unpub = page.getByRole("button", { name: "Unpublish" });
        if (await unpub.count()) {
          await unpub.click();
          await page.getByRole("dialog").getByRole("button", { name: "Unpublish" }).click();
          await expect(page.getByText(/Unpublished\./)).toBeVisible();
        }
        await page.getByRole("button", { name: "Delete", exact: true }).click();
        await page.getByRole("dialog").getByRole("button", { name: /^Delete / }).click();
        await page.waitForLoadState("networkidle");
      }
      // Confirmed: still ours, and now deleted (hidden from the website and lists; restorable).
      expect(await ownedByThisRun(page, segment, id)).toBe(true);
      await expect(page.getByText("This item is deleted.")).toBeVisible();
    } catch (e) {
      needsReview.push(`/admin/${segment}/${id}: clean-up did not complete (${String((e as Error).message).split("\n")[0]})`);
    }
  }
  if (mediaPending) {
    try {
      await page.goto("/admin/media");
      const card = page.locator("li").filter({ hasText: mediaAlt });
      const n = await card.count();
      if (n !== 1) needsReview.push(`/admin/media: expected 1 image with this run's marker, found ${n}; left untouched`);
      else {
        await card.getByRole("button", { name: "Delete" }).click();
        await page.getByRole("dialog").getByRole("button", { name: "Delete image" }).click();
        await expect(page.getByRole("main").getByRole("status").first()).toBeVisible();
        await page.goto("/admin/media");
        await expect(page.locator("li").filter({ hasText: mediaAlt })).toHaveCount(0);
      }
      mediaPending = false;
    } catch (e) {
      needsReview.push(`/admin/media: clean-up did not complete (${String((e as Error).message).split("\n")[0]})`);
    }
  }
}

let ctx: BrowserContext;
let page: Page;

async function adminPage(browser: Browser) {
  ctx = await browser.newContext();
  page = await ctx.newPage();
  return page;
}

test.afterAll(async ({ browser }) => {
  if ((!created.length && !mediaPending && !needsReview.length) || !ADMIN) return;
  // A test failed before the clean-up test. The hook gets its own time (a fresh two-factor sign-in
  // alone can wait up to 30 s for a new code), reuses the run's admin session when it is still
  // signed in, and removes only this run's records.
  test.setTimeout(300_000);
  let p: Page | null = page && !page.isClosed() ? page : null;
  if (p && (await p.request.get("/admin", { maxRedirects: 0 })).status() !== 200) p = null;
  if (!p) {
    p = await (await browser.newContext()).newPage();
    await signIn(p, ADMIN);
  }
  await cleanUp(p);
  if (needsReview.length) console.warn(`staging-live-cms: for manual review in the admin:\n${needsReview.join("\n")}`);
  expect(needsReview, "records left for manual review").toEqual([]);
});

test("unauthorised access: admin closed to visitors, wrong sign-in reveals nothing", async ({ page: anon }, info) => {
  test.skip(info.project.name !== "desktop-1280", "desktop only (one live run)");
  for (const path of ["/admin", "/admin/pages", "/admin/staff", "/admin/audit", "/admin/media"]) {
    await anon.goto(path);
    expect(anon.url(), path).toContain("/en/sign-in");
  }
  const preview = await anon.request.get("/admin/preview/00000000-0000-0000-0000-000000000000", { maxRedirects: 0 });
  expect([307, 404]).toContain(preview.status());
  // An unknown fictional address: the same neutral error, and the staff account is not involved.
  await anon.goto("/en/sign-in");
  await anon.getByLabel(/Email address/).fill(`nobody-${RUN}@nltag.test`);
  await anon.getByLabel(/^Password/).fill("not-a-real-password-1");
  await anon.getByRole("button", { name: "Sign in" }).click();
  await expect(anon.getByRole("alert").first()).toBeVisible({ timeout: 30_000 });
  expect(anon.url()).toContain("/en/sign-in");
  const session = await anon.request.get("/api/auth/get-session");
  expect(await session.text()).not.toContain("@nltag.test");
});

test("sign in with two-factor; the session persists across reloads and tabs", async ({ browser }, info) => {
  test.skip(info.project.name !== "desktop-1280", "desktop only (one live run)");
  test.setTimeout(120_000);
  await adminPage(browser);
  await signIn(page, ADMIN!);
  expect((await page.goto("/admin"))!.status()).toBe(200);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  const tab = await ctx.newPage();
  expect((await tab.goto("/admin/pages"))!.status()).toBe(200);
  await tab.close();
  const session = await page.request.get("/api/auth/get-session");
  expect(await session.text()).toContain(ADMIN!.email);
});

test("dashboard: Church Admin sections, noindex, accessible", async ({}, info) => {
  test.skip(info.project.name !== "desktop-1280", "desktop only (one live run)");
  const res = await page.goto("/admin");
  expect(res!.headers()["x-robots-tag"]).toContain("noindex");
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent administrative activity" })).toBeVisible();
  await axeClean(page);
});

test("pages: create, edit, preview (not public), publish, public in both languages, unpublish", async ({}, info) => {
  test.skip(info.project.name !== "desktop-1280", "desktop only (one live run)");
  test.setTimeout(180_000);
  const slug = `e2e-live-${RUN}`;
  await createDraft(page, "pages", async (p) => {
    await p.locator("#f-slug").fill(slug);
    await p.locator("#f-ta-title").fill(`${MARK} சோதனைப் பக்கம்`);
    await p.locator("#f-en-title").fill(`${MARK} Test page`);
    await p.locator("#f-ta-bodyMd").fill("சோதனை உரை.");
    await p.locator("#f-en-bodyMd").fill("Fictional test text.");
  });
  await page.locator("#f-en-bodyMd").fill("Fictional test text, **edited**.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator("main").getByRole("status").filter({ hasText: "Saved." })).toBeVisible();

  expect((await page.request.get(`/en/${slug}`)).status()).toBe(404);
  await page.getByRole("link", { name: "Preview" }).click();
  await expect(page.getByText("Preview — not public")).toBeVisible();
  await expect(page.locator("article[lang=en] strong")).toHaveText("edited");
  const previewRes = await page.request.get(`/admin/preview/${created.at(-1)!.id}`);
  expect(previewRes.headers()["cache-control"]).toContain("no-store");
  expect((await (await page.context().browser()!.newContext()).request.get(`${STAGING_ORIGIN}/admin/preview/${created.at(-1)!.id}`, { maxRedirects: 0 })).status()).not.toBe(200);
  await page.goBack();

  await publish(page);
  for (const locale of ["ta", "en"] as const) {
    const pub = await page.request.get(`/${locale}/${slug}`);
    expect(pub.status(), locale).toBe(200);
    expect(await pub.text()).toContain(MARK);
  }
  await unpublish(page, "page");
  expect((await page.request.get(`/en/${slug}`)).status()).toBe(404);
});

test("sermons: create, edit, publish; public list, search and detail; unpublish", async ({}, info) => {
  test.skip(info.project.name !== "desktop-1280", "desktop only (one live run)");
  test.setTimeout(180_000);
  const id = await createDraft(page, "sermons", async (p) => {
    await p.locator("#f-ta-title").fill(`${MARK} சோதனைச் செய்தி`);
    await p.locator("#f-en-title").fill(`${MARK} Test sermon`);
    await p.locator("#f-detail-speaker").fill(`${MARK} Speaker`);
    await p.locator("#f-detail-sermonDate").fill("2026-11-06");
  });
  await page.locator("#f-en-summary").fill(`Fictional summary ${RUN}`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator("main").getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
  await publish(page);

  await page.goto(`/en/sermons?q=${encodeURIComponent(RUN)}`);
  await expect(page.locator("main")).toContainText(`${MARK} Test sermon`);
  await axeClean(page);
  await page.goto(`/en/sermons?q=zz-no-match-${RUN}`);
  await expect(page.locator("main")).toContainText("Nothing matches your search.");
  // No sermon results at all (no detail links). The speaker filter offers the speakers of every
  // published sermon by design (speakersOf(all) in src/app/[locale]/sermons/page.tsx), so this
  // run's speaker is still listed there; that is the filter, not a search result.
  await expect(page.locator('main a[href^="/en/sermons/"]')).toHaveCount(0);
  // The filter is shown when two or more speakers have published sermons (staging has the seeded
  // "[E2E Speaker]" too); when shown, it offers this run's speaker exactly once.
  const speaker = page.locator('main select[name="speaker"]');
  if (await speaker.count()) await expect(speaker.locator("option").filter({ hasText: `${MARK} Speaker` })).toHaveCount(1);
  // Pagination: an out-of-range page is answered safely (no error page).
  expect((await page.goto("/en/sermons?page=9999"))!.status()).toBe(200);
  expect((await page.goto(`/en/sermons/${id}`))!.status()).toBe(200);
  await expect(page.locator("h1")).toContainText(MARK);

  await page.goto(`/admin/sermons?q=${encodeURIComponent(RUN)}`);
  await expect(page.locator("main")).toContainText(MARK);
  await page.goto("/admin/sermons?q=zzz-no-match");
  await expect(page.getByText("Nothing matches these filters.")).toBeVisible();
  await page.goto(`/admin/sermons/${id}`);
  await unpublish(page, "sermon");
  expect((await page.request.get(`/en/sermons/${id}`)).status()).toBe(404);
});

test("special meetings (events): draft → review → publish → public → unpublish; no home addresses", async ({ browser }, info) => {
  test.skip(info.project.name !== "desktop-1280", "desktop only (one live run)");
  test.setTimeout(240_000);
  // The review step needs a Content Editor (a Church Admin publishes directly; it cannot submit).
  const editorPage = EDITOR ? await (await browser.newContext()).newPage() : null;
  if (editorPage) await signIn(editorPage, EDITOR!);
  const author = editorPage ?? page;
  await author.goto("/admin/events/new");
  await author.locator("#f-ta-title").fill(`${MARK} சோதனைக் கூட்டம்`);
  await author.locator("#f-en-title").fill(`${MARK} Test meeting`);
  await author.locator("#f-detail-startsAt").fill("2031-01-09T19:30");
  await author.locator("#f-detail-locationKind").selectOption("MEMBERS_HOMES");
  await author.locator("#f-detail-locationText").fill("Block 1, Street 2");
  await author.getByRole("button", { name: "Save draft" }).click();
  await expect(author.locator("main").getByRole("alert")).toContainText("home address");
  await author.locator("#f-detail-locationText").fill("");
  await author.locator("#f-detail-locationKind").selectOption("NECK");
  await author.getByRole("button", { name: "Save draft" }).click();
  await author.waitForURL(/\/admin\/events\/[0-9a-f-]{36}/);
  const id = new URL(author.url()).pathname.split("/").pop()!;
  created.push({ segment: "events", id });

  if (editorPage) {
    await expect(editorPage.getByRole("button", { name: "Publish", exact: true })).toHaveCount(0);
    await editorPage.getByRole("button", { name: "Submit for review" }).click();
    await expect(editorPage.getByText(/Submitted for review/).first()).toBeVisible();
    await editorPage.context().close();
    await page.goto("/admin/review");
    await expect(page.locator("main")).toContainText(`${MARK} Test meeting`);
  } else {
    test.info().annotations.push({ type: "not covered", description: "review step: no STAGING_EDITOR_* account supplied" });
  }
  await page.goto(`/admin/events/${id}`);
  await publish(page);
  expect(await (await page.request.get("/en/worship-times")).text()).toContain(`${MARK} Test meeting`);
  expect(await (await page.request.get("/ta/worship-times")).text()).toContain(`${MARK} சோதனைக் கூட்டம்`);
  await unpublish(page, "special meeting");
  expect(await (await page.request.get("/en/worship-times")).text()).not.toContain(MARK);
});

test("media: upload, original visible to staff only, list, delete", async ({}, info) => {
  test.skip(info.project.name !== "desktop-1280", "desktop only (one live run)");
  test.setTimeout(120_000);
  const jpeg = await sharp({ create: { width: 1200, height: 800, channels: 3, background: { r: 120, g: 160, b: 140 } } }).jpeg().toBuffer();
  await page.goto("/admin/media");
  await page.locator("input[type=file]").setInputFiles({ name: "e2e-live.jpg", mimeType: "image/jpeg", buffer: jpeg });
  await page.getByLabel(/English/).first().fill(mediaAlt);
  await page.getByRole("button", { name: /Upload/ }).click();
  await expect(page.getByRole("main").getByRole("status").first()).toContainText("Image uploaded");
  mediaPending = true;
  await page.goto("/admin/media");
  const card = page.locator("li").filter({ hasText: mediaAlt });
  await expect(card).toHaveCount(1);
  const src = (await card.locator("img").getAttribute("src"))!;
  // The original is served to staff only.
  const anon = await page.context().browser()!.newContext();
  expect((await anon.request.get(new URL(src, STAGING_ORIGIN).toString(), { maxRedirects: 0 })).status()).not.toBe(200);
  await anon.close();
  await card.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete image" }).click();
  await expect(page.getByRole("main").getByRole("status").first()).toBeVisible();
  await page.goto("/admin/media");
  await expect(page.locator("li").filter({ hasText: mediaAlt })).toHaveCount(0);
  mediaPending = false;
});

test("role restrictions: Content Editor and Prayer Team", async ({ browser }, info) => {
  test.skip(info.project.name !== "desktop-1280", "desktop only (one live run)");
  test.skip(!EDITOR && !PRAYER, "STAGING_EDITOR_* / STAGING_PRAYER_* not supplied");
  test.setTimeout(180_000);
  if (EDITOR) {
    const p = await (await browser.newContext()).newPage();
    await signIn(p, EDITOR);
    expect((await p.goto("/admin"))!.status()).toBe(200);
    for (const path of ["/admin/staff", "/admin/audit", "/admin/prayer", "/admin/contact"]) expect((await p.goto(path))!.status(), path).toBe(404);
    await p.goto("/admin/pages/new");
    await expect(p.getByRole("button", { name: "Publish", exact: true })).toHaveCount(0);
    await p.context().close();
  }
  if (PRAYER) {
    const p = await (await browser.newContext()).newPage();
    await signIn(p, PRAYER);
    for (const path of ["/admin/pages", "/admin/sermons", "/admin/media", "/admin/staff", "/admin/audit", "/admin/contact"]) expect((await p.goto(path))!.status(), path).toBe(404);
    await p.context().close();
  }
});

test("clean-up: every record this run created is unpublished and deleted", async ({}, info) => {
  test.skip(info.project.name !== "desktop-1280", "desktop only (one live run)");
  test.setTimeout(180_000);
  await cleanUp(page);
  expect(created).toEqual([]);
  expect(needsReview, "records left for manual review").toEqual([]);
  await page.goto(`/admin/sermons?q=${encodeURIComponent(RUN)}`);
  await expect(page.locator("main")).not.toContainText(MARK);
  expect(await (await page.request.get("/en/sermons")).text()).not.toContain(MARK);
});

test("sign out ends the session and closes the admin again", async ({}, info) => {
  test.skip(info.project.name !== "desktop-1280", "desktop only (one live run)");
  await page.goto("/en/account");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.endsWith("/account"));
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/sign-in/);
  expect(await (await page.request.get("/api/auth/get-session")).text()).not.toContain(ADMIN!.email);
  await ctx.close();
});
