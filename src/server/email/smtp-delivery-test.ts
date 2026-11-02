import "server-only";
// TEMPORARY — SMTP Stage A delivery test (owner request, 2 Nov 2026). Remove in a separate
// reviewed PR once the test has passed (docs/operations/smtp-delivery-test.md, "Removal").
//
// Sends ONE dedicated bilingual "email delivery test" message (Tamil first, English second)
// through the existing production SMTP transport to a church-controlled address, while the
// accounts gate stays closed. It is NOT the verification email: no verification wording, no
// expiry, no token. The only links are the labelled website homepages (/ta and /en). It runs only
// from the Hostinger build (`scripts/hostinger-build.mjs`) when the owner has set the approval
// variables for that build. It never touches the database, never creates an account or token,
// and never prints SMTP, database or recipient details.
//
// Two phases, and the line between them is what makes retries safe:
//
//   1. Checks (before any attempt). Every failure here is a REFUSAL: nothing is written to disk,
//      nothing is sent, and the owner can fix the cause and rebuild with the SAME run id.
//        - NLTAG_APPROVED_SMTP_TEST must be exactly "1" (otherwise the step is skipped silently);
//        - production only, accounts gate OFF (NLTAG_ACCOUNTS_ENABLED not "1"), not combined with
//          a production migration;
//        - all four SMTP variables set; SMTP_USER is the church Gmail account; SMTP_FROM is exactly
//          "New Life Tamil AG Church <that account>";
//        - BETTER_AUTH_URL is exactly https://nltagkuwait.com (the site origin of the links);
//        - recipient is the church mailbox or one of its +tag aliases, nothing else;
//        - a well-formed run id; the transport in use is SMTP; the message renders; the marker
//          folder is safe (outside the deployment and any web root).
//
//   2. Attempt. The marker `<home>/nltag-data/ops/smtp-test-<run id>.json` is created EXCLUSIVELY
//      immediately before sending. From that moment the run id is spent: whatever happens next
//      (accepted, rejected, timed out, build killed), no later build can send for that run id.
//      A new attempt always needs a new run id.
import { promises as fs } from "node:fs";
import path from "node:path";
import { t, type Locale } from "@/content/ui-strings";
import { churchName } from "@/content/church";
import { unsafeLocation } from "../storage/media-dir";
import { escapeHtml, withChurch, type RenderedEmail } from "./templates";

/** The church's Gmail account (SMTP readiness report, section 3). Not a secret. */
export const CHURCH_MAILBOX = "newlifetamilassembly@gmail.com";
export const EXPECTED_ORIGIN = "https://nltagkuwait.com";
/** Homepage links shown in the test email, labelled as the website. No token, nothing account-related. */
export const WEBSITE_LINKS: Readonly<Record<Locale, string>> = { ta: `${EXPECTED_ORIGIN}/ta`, en: `${EXPECTED_ORIGIN}/en` };
export const MARKER_DIR_NAME = path.join("nltag-data", "ops");

const RECIPIENT = /^newlifetamilassembly(\+[a-z0-9-]{1,32})?@gmail\.com$/;
const RUN_ID = /^[a-z0-9][a-z0-9-]{2,39}$/;
const FROM = /^(.+?)\s*<([^<>\s]+)>$/;
const ERROR_CODE = /^[A-Z_]{2,24}(:\d{3})?$/;

export type SmtpTestRequest =
  | { status: "not-requested" }
  | { status: "refused"; reason: string }
  | { status: "approved"; to: string; runId: string };

type Env = Record<string, string | undefined>;
const val = (env: Env, k: string) => env[k]?.trim() ?? "";

/** Pure validation of the owner's approval and the production configuration. Never returns values of secrets. */
export function parseSmtpTestRequest(env: Env): SmtpTestRequest {
  if (val(env, "NLTAG_APPROVED_SMTP_TEST") !== "1") return { status: "not-requested" };
  const refuse = (reason: string): SmtpTestRequest => ({ status: "refused", reason });

  if (env.NODE_ENV !== "production") return refuse("runs only with NODE_ENV=production");
  if (val(env, "NLTAG_ACCOUNTS_ENABLED") === "1") return refuse("Stage A requires the accounts gate to stay closed (NLTAG_ACCOUNTS_ENABLED must not be 1)");
  if (val(env, "NLTAG_APPROVED_PRODUCTION_MIGRATION") === "1") return refuse("do not combine the SMTP test with a production migration build");

  if (!["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"].every((k) => val(env, k) !== "")) {
    return refuse("SMTP_HOST, SMTP_USER, SMTP_PASS and SMTP_FROM must all be set");
  }
  if (val(env, "SMTP_USER").toLowerCase() !== CHURCH_MAILBOX) return refuse("SMTP_USER is not the church Gmail account");
  const from = FROM.exec(val(env, "SMTP_FROM"));
  const fromName = from?.[1]?.replace(/^"(.*)"$/, "$1").trim();
  if (!from || fromName !== churchName.en || from[2]?.toLowerCase() !== CHURCH_MAILBOX) {
    return refuse(`SMTP_FROM must be exactly "${churchName.en} <${CHURCH_MAILBOX}>"`);
  }

  let origin: string;
  try {
    const u = new URL(val(env, "BETTER_AUTH_URL"));
    origin = u.pathname === "/" && !u.search && !u.hash ? u.origin : "";
  } catch {
    origin = "";
  }
  if (origin !== EXPECTED_ORIGIN) return refuse(`BETTER_AUTH_URL must be exactly ${EXPECTED_ORIGIN}`);

  const to = val(env, "NLTAG_SMTP_TEST_TO").toLowerCase();
  if (!RECIPIENT.test(to)) return refuse("NLTAG_SMTP_TEST_TO must be the church mailbox or a +tag alias of it");

  const runId = val(env, "NLTAG_SMTP_TEST_RUN_ID");
  if (!RUN_ID.test(runId)) return refuse("NLTAG_SMTP_TEST_RUN_ID must be 3-40 characters: lowercase letters, digits, hyphens");

  return { status: "approved", to, runId };
}

/**
 * The dedicated test message. Tamil block first, English second, then the footer in both
 * languages. Plain HTML: no images, no tracking, no remote assets. The website link is
 * labelled as the website, and there is no verification wording, expiry or token.
 */
export function renderSmtpTestEmail(): RenderedEmail {
  const block = (locale: Locale) => ({
    body: withChurch(t("email.smtpTest.body", locale), locale),
    label: t("email.smtpTest.websiteLabel", locale),
    link: WEBSITE_LINKS[locale],
    footer: withChurch(t("email.footer", locale), locale),
  });
  const ta = block("ta");
  const en = block("en");
  const subject = `${t("email.smtpTest.subject", "ta")} · ${t("email.smtpTest.subject", "en")}`;
  const text = [ta.body, `${ta.label}: ${ta.link}`, "", "—", "", en.body, `${en.label}: ${en.link}`, "", ta.footer, en.footer].join("\n");
  const section = (b: typeof ta, lang: Locale) =>
    `<div lang="${lang}"><p>${escapeHtml(b.body)}</p><p>${escapeHtml(b.label)}: <a href="${escapeHtml(b.link)}">${escapeHtml(b.link)}</a></p></div>`;
  const html = [
    "<!doctype html>",
    '<html lang="ta"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${escapeHtml(subject)}</title></head><body>`,
    section(ta, "ta"),
    "<hr>",
    section(en, "en"),
    `<p lang="ta"><small>${escapeHtml(ta.footer)}</small></p>`,
    `<p lang="en"><small>${escapeHtml(en.footer)}</small></p>`,
    "</body></html>",
  ].join("");
  return { subject, text, html };
}

/** "church mailbox (+webtest)" — safe to print in build logs. */
export function describeRecipient(to: string): string {
  const tag = /\+([a-z0-9-]+)@/.exec(to)?.[1];
  return tag ? `church mailbox (+${tag})` : "church mailbox";
}

export interface SmtpTestDeps {
  env: Env;
  /** Account home from the system user database (same rule as media storage). */
  home: string;
  /** Deployed application folder; the marker must never live inside it. */
  appDir: string;
  /** Name of the transport the app would use; must be "smtp". */
  transportName: string;
  send: (mail: { to: string } & RenderedEmail) => Promise<void>;
  now?: () => Date;
}

/** What an earlier attempt with this run id recorded. "attempting" = it never recorded a result (e.g. the build was stopped). */
export type PreviousAttempt = { result: "sent" } | { result: "failed"; errorCode?: string } | { result: "attempting" } | { result: "unreadable" };

export type SmtpTestOutcome =
  | { status: "not-requested" }
  | { status: "refused"; reason: string }
  | { status: "already-attempted"; runId: string; previous: PreviousAttempt }
  | { status: "sent"; runId: string; recipient: string }
  | { status: "failed"; runId: string; recipient: string; errorCode: string };

/** Only a short error code leaves this function; never the message (it can echo server responses). */
function errorCode(e: unknown): string {
  const err = e as { code?: unknown; responseCode?: unknown } | null;
  const code = typeof err?.code === "string" && /^[A-Z_]{2,24}$/.test(err.code) ? err.code : "SEND_ERROR";
  return typeof err?.responseCode === "number" ? `${code}:${err.responseCode}` : code;
}

/** Reads only the status (and a validated short code) from an existing marker. */
async function readPrevious(marker: string): Promise<PreviousAttempt> {
  try {
    const data = JSON.parse(await fs.readFile(/* turbopackIgnore: true */ marker, "utf8")) as { status?: unknown; errorCode?: unknown };
    if (data.status === "sent") return { result: "sent" };
    if (data.status === "attempting") return { result: "attempting" };
    if (data.status === "failed") {
      return typeof data.errorCode === "string" && ERROR_CODE.test(data.errorCode) ? { result: "failed", errorCode: data.errorCode } : { result: "failed" };
    }
  } catch {
    // fall through: the marker exists, so the run id is spent regardless of its contents
  }
  return { result: "unreadable" };
}

export async function runSmtpDeliveryTest(deps: SmtpTestDeps): Promise<SmtpTestOutcome> {
  // ---- Phase 1: checks. Refusals here write nothing and send nothing; the same run id stays usable.
  const req = parseSmtpTestRequest(deps.env);
  if (req.status !== "approved") return req;
  if (deps.transportName !== "smtp") return { status: "refused", reason: "the configured mail transport is not SMTP" };
  if (!path.isAbsolute(deps.home)) return { status: "refused", reason: "account home is not an absolute path" };
  const dir = path.join(deps.home, MARKER_DIR_NAME);
  const unsafe = unsafeLocation(dir, deps.appDir);
  if (unsafe) return { status: "refused", reason: `marker folder refused: ${unsafe}` };
  let message: RenderedEmail;
  try {
    message = renderSmtpTestEmail();
  } catch {
    return { status: "refused", reason: "the test email could not be prepared" };
  }
  const now = deps.now ?? (() => new Date());
  const marker = path.join(dir, `smtp-test-${req.runId}.json`);

  // ---- Phase 2: attempt. Claim the run id exclusively; once the claim exists it is never released.
  try {
    await fs.mkdir(/* turbopackIgnore: true */ dir, { recursive: true, mode: 0o700 });
    await fs.writeFile(/* turbopackIgnore: true */ marker, JSON.stringify({ runId: req.runId, status: "attempting", at: now().toISOString() }), {
      flag: "wx",
      mode: 0o600,
    });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST") return { status: "already-attempted", runId: req.runId, previous: await readPrevious(marker) };
    // The claim was not created, so nothing was attempted: still a correctable refusal.
    return { status: "refused", reason: `cannot record the run marker (${(e as NodeJS.ErrnoException).code ?? "error"}), so nothing was sent` };
  }

  const recipient = describeRecipient(req.to);
  const record = (status: "sent" | "failed", extra: Record<string, string> = {}) =>
    fs
      .writeFile(/* turbopackIgnore: true */ marker, JSON.stringify({ runId: req.runId, status, at: now().toISOString(), ...extra }), { mode: 0o600 })
      .catch(() => undefined); // the claim already blocks repeats; the result is informational
  try {
    await deps.send({ to: req.to, ...message });
  } catch (e) {
    const code = errorCode(e);
    await record("failed", { errorCode: code });
    return { status: "failed", runId: req.runId, recipient, errorCode: code };
  }
  await record("sent");
  return { status: "sent", runId: req.runId, recipient };
}

/**
 * Build exit code. Refusals and failures stop the build (the previous release keeps serving).
 * "Already attempted" sends nothing and does not stop the build, so variables left behind never
 * block normal deployments.
 */
export const exitCodeFor = (o: SmtpTestOutcome) => (o.status === "refused" || o.status === "failed" ? 1 : 0);

const previousText = (p: PreviousAttempt) =>
  p.result === "sent"
    ? "recorded as accepted by SMTP"
    : p.result === "failed"
      ? `recorded as FAILED${p.errorCode ? ` (${p.errorCode})` : ""}`
      : p.result === "attempting"
        ? "started but never recorded a result (the build may have been stopped)"
        : "recorded, result unreadable";

export function describeOutcome(o: SmtpTestOutcome): string {
  switch (o.status) {
    case "not-requested":
      return "No SMTP delivery test requested (NLTAG_APPROVED_SMTP_TEST not set).";
    case "refused":
      return `SMTP delivery test REFUSED before any attempt, nothing sent: ${o.reason}. Fix this and rebuild; the same run id may be used.`;
    case "already-attempted":
      return `SMTP delivery test run "${o.runId}" was already attempted (${previousText(o.previous)}). Nothing sent now; this run id can never send again. ${
        o.previous.result === "sent" ? "Remove the NLTAG_*SMTP_TEST* variables." : "Check the inbox and Spam first; for a new attempt set a NEW run id."
      }`;
    case "sent":
      return `SMTP delivery test run "${o.runId}": accepted by SMTP for the ${o.recipient}. Remove the NLTAG_*SMTP_TEST* variables now.`;
    case "failed":
      return `SMTP delivery test run "${o.runId}" FAILED (${o.errorCode}). The message was probably not delivered; check the inbox and Spam before retrying. This run id can never send again: a new attempt needs a NEW run id.`;
  }
}
