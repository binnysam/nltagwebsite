import "server-only";
// TEMPORARY — SMTP Stage A delivery test (owner request, 2 Nov 2026). Remove in a separate
// reviewed PR once the test has passed (docs/operations/smtp-delivery-test.md, "Removal").
//
// Sends ONE copy of the existing bilingual `verify` email through the existing production SMTP
// transport to a church-controlled address, while the accounts gate stays closed. It runs only
// from the Hostinger build (`scripts/hostinger-build.mjs`) when the owner has set the approval
// variables for that build. It never touches the database, never creates an account or token,
// and never prints SMTP, database or recipient details.
//
// Fail-closed rules (each one is a refusal, nothing is sent):
//   - NLTAG_APPROVED_SMTP_TEST must be exactly "1" (otherwise the step is skipped silently);
//   - production only, accounts gate must be OFF (NLTAG_ACCOUNTS_ENABLED not "1");
//   - all four SMTP variables set; SMTP_USER is the church Gmail account; SMTP_FROM is exactly
//     "New Life Tamil AG Church <that account>";
//   - BETTER_AUTH_URL is exactly https://nltagkuwait.com (the link is built from it);
//   - recipient is the church mailbox or one of its +tag aliases, nothing else;
//   - a run id names this approval; a marker file for that run id is created exclusively
//     BEFORE sending, so any later build with the same variables sends nothing.
import { promises as fs } from "node:fs";
import path from "node:path";
import { churchName } from "@/content/church";
import { unsafeLocation } from "../storage/media-dir";
import { renderEmail, type RenderedEmail } from "./templates";

/** The church's Gmail account (SMTP readiness report, section 3). Not a secret. */
export const CHURCH_MAILBOX = "newlifetamilassembly@gmail.com";
export const EXPECTED_ORIGIN = "https://nltagkuwait.com";
/** The page the test email links to: the Tamil homepage. No token, nothing account-related. */
export const TEST_LINK = `${EXPECTED_ORIGIN}/ta`;
export const MARKER_DIR_NAME = path.join("nltag-data", "ops");

const RECIPIENT = /^newlifetamilassembly(\+[a-z0-9-]{1,32})?@gmail\.com$/;
const RUN_ID = /^[a-z0-9][a-z0-9-]{2,39}$/;
const FROM = /^(.+?)\s*<([^<>\s]+)>$/;

export type SmtpTestRequest =
  | { status: "not-requested" }
  | { status: "refused"; reason: string }
  | { status: "approved"; to: string; runId: string; link: string };

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

  return { status: "approved", to, runId, link: TEST_LINK };
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

export type SmtpTestOutcome =
  | { status: "not-requested" }
  | { status: "refused"; reason: string }
  | { status: "already-done"; runId: string }
  | { status: "sent"; runId: string; recipient: string }
  | { status: "failed"; runId: string; recipient: string; errorCode: string };

/** Only a short error code leaves this function; never the message (it can echo server responses). */
function errorCode(e: unknown): string {
  const err = e as { code?: unknown; responseCode?: unknown } | null;
  const code = typeof err?.code === "string" && /^[A-Z_]{2,24}$/.test(err.code) ? err.code : "SEND_ERROR";
  return typeof err?.responseCode === "number" ? `${code}:${err.responseCode}` : code;
}

export async function runSmtpDeliveryTest(deps: SmtpTestDeps): Promise<SmtpTestOutcome> {
  const req = parseSmtpTestRequest(deps.env);
  if (req.status !== "approved") return req;
  if (deps.transportName !== "smtp") return { status: "refused", reason: "the configured mail transport is not SMTP" };
  const now = deps.now ?? (() => new Date());

  // Duplicate-send guard: one marker per run id, persistent across deployments, created
  // exclusively before sending. If it exists (sent, failed or interrupted), nothing is sent.
  if (!path.isAbsolute(deps.home)) return { status: "refused", reason: "account home is not an absolute path" };
  const dir = path.join(deps.home, MARKER_DIR_NAME);
  const unsafe = unsafeLocation(dir, deps.appDir);
  if (unsafe) return { status: "refused", reason: `marker folder refused: ${unsafe}` };
  const marker = path.join(dir, `smtp-test-${req.runId}.json`);
  try {
    await fs.mkdir(/* turbopackIgnore: true */ dir, { recursive: true, mode: 0o700 });
    await fs.writeFile(/* turbopackIgnore: true */ marker, JSON.stringify({ runId: req.runId, status: "claimed", at: now().toISOString() }), {
      flag: "wx",
      mode: 0o600,
    });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST") return { status: "already-done", runId: req.runId };
    return { status: "refused", reason: `cannot record the run marker (${(e as NodeJS.ErrnoException).code ?? "error"}), so nothing was sent` };
  }

  const recipient = describeRecipient(req.to);
  const record = (status: "sent" | "failed", extra: Record<string, string> = {}) =>
    fs
      .writeFile(/* turbopackIgnore: true */ marker, JSON.stringify({ runId: req.runId, status, at: now().toISOString(), ...extra }), { mode: 0o600 })
      .catch(() => undefined); // the claim already blocks repeats; a status update is informational
  try {
    await deps.send({ to: req.to, ...renderEmail("verify", req.link) });
  } catch (e) {
    const code = errorCode(e);
    await record("failed", { errorCode: code });
    return { status: "failed", runId: req.runId, recipient, errorCode: code };
  }
  await record("sent");
  return { status: "sent", runId: req.runId, recipient };
}

/** Build exit code: refusals and failures stop the build (the previous release keeps serving). */
export const exitCodeFor = (o: SmtpTestOutcome) => (o.status === "refused" || o.status === "failed" ? 1 : 0);

export function describeOutcome(o: SmtpTestOutcome): string {
  switch (o.status) {
    case "not-requested":
      return "No SMTP delivery test requested (NLTAG_APPROVED_SMTP_TEST not set).";
    case "refused":
      return `SMTP delivery test REFUSED, nothing sent: ${o.reason}.`;
    case "already-done":
      return `SMTP delivery test run "${o.runId}" already happened; nothing sent. Remove the NLTAG_*SMTP_TEST* variables.`;
    case "sent":
      return `SMTP delivery test run "${o.runId}": accepted by SMTP for the ${o.recipient}. Remove the NLTAG_*SMTP_TEST* variables now.`;
    case "failed":
      return `SMTP delivery test run "${o.runId}" FAILED (${o.errorCode}). Nothing was delivered. A new attempt needs a new run id.`;
  }
}
