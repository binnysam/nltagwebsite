import "server-only";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import nodemailer, { type Transporter } from "nodemailer";
import { isStaging, stagingMailDir, stagingMailMode } from "../deployment/environment";
import { assertStagingVerified } from "../deployment/verify";
import { serverEnv, smtpConfigured, type ServerEnv } from "../env";

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface MailTransport {
  readonly name: "smtp" | "dev-outbox" | "memory" | "staging-capture";
  send(mail: OutgoingMail): Promise<void>;
}

/** Captured mail for tests (NODE_ENV=test). */
export const memoryOutbox: OutgoingMail[] = [];

/**
 * Gmail SMTP with an App Password (Phase 4a decision). Credentials only from environment
 * variables; they are not set until the owner approves the email testing step.
 * Port 465 = implicit TLS; 587 = STARTTLS (required, never plain).
 * Exported (options only, no connection) for the TLS unit test.
 */
export function smtpOptions(env: ServerEnv) {
  const port = env.SMTP_PORT ?? 465;
  return {
    host: env.SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    // v6.1 §5: certificate checks are explicit, so NODE_TLS_REJECT_UNAUTHORIZED=0 in the process
    // environment (a harness setting) can never switch them off for the real mail server.
    tls: { minVersion: "TLSv1.2" as const, rejectUnauthorized: true },
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  };
}

function smtpTransport(): MailTransport {
  const env = serverEnv();
  const transporter: Transporter = nodemailer.createTransport(smtpOptions(env));
  return {
    name: "smtp",
    async send(mail) {
      await transporter.sendMail({ from: env.SMTP_FROM, ...mail });
    },
  };
}

/**
 * Local development without SMTP: writes each message to `.data/mail/` (git-ignored) so the
 * verification and reset links can be opened by hand. Refuses to run in production.
 */
function devOutbox(): MailTransport {
  const env = serverEnv();
  const dir = join(process.cwd(), ".data", "mail");
  return {
    name: "dev-outbox",
    async send(mail) {
      if (env.NODE_ENV === "production" && !localOutboxAllowed()) throw new Error("dev outbox is not allowed in production");
      mkdirSync(dir, { recursive: true });
      const file = join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${mail.subject.slice(0, 20).replace(/\W+/g, "_")}.json`);
      writeFileSync(file, JSON.stringify(mail, null, 2), { mode: 0o600 });
    },
  };
}

function memory(): MailTransport {
  return {
    name: "memory",
    async send(mail) {
      memoryOutbox.push(mail);
    },
  };
}

/**
 * A local production build (`next start` for browser tests) may use the outbox only when it is
 * explicitly asked for AND the site URL is this machine. A deployed site can never qualify.
 */
function localOutboxAllowed(): boolean {
  const host = new URL(serverEnv().BETTER_AUTH_URL).hostname;
  return process.env.NLTAG_LOCAL_MAIL_OUTBOX === "1" && ["localhost", "127.0.0.1", "[::1]"].includes(host);
}

/**
 * Staging (NLTAG_STAGING_MAIL=capture, the default): nothing is sent. Each message is written as a
 * JSON file (0600) to the staging mail folder (NLTAG_STAGING_MAIL_DIR, else `mail-capture` next to
 * the staging media folder), where testers open set-password links through hPanel's File Manager.
 * The subject is prefixed so a captured message can never be mistaken for a real one.
 */
function stagingCapture(): MailTransport {
  const dir = stagingMailDir();
  if (!dir) throw new Error("Staging mail folder is not configured");
  return {
    name: "staging-capture",
    async send(mail) {
      assertStagingVerified("mail capture");
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      const file = join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomBytes(4).toString("hex")}.json`);
      writeFileSync(file, JSON.stringify({ capturedBy: "staging", ...mail, subject: `[STAGING] ${mail.subject}` }, null, 2), { mode: 0o600, flag: "wx" });
    },
  };
}

let transport: MailTransport | undefined;

export function getTransport(): MailTransport {
  if (transport) return transport;
  const env = serverEnv();
  if (isStaging()) {
    // Staging never reaches a real inbox: capture to files, or a mail sandbox only (environment.ts).
    const mode = stagingMailMode();
    if (mode === "sandbox" && smtpConfigured(env)) {
      const smtp = smtpTransport();
      transport = { name: "smtp", send: (mail) => (assertStagingVerified("mail sandbox"), smtp.send({ ...mail, subject: `[STAGING] ${mail.subject}` })) };
    } else transport = stagingCapture();
    return transport;
  }
  if (env.NODE_ENV === "test") transport = memory();
  else if (smtpConfigured(env)) transport = smtpTransport();
  else if (env.NODE_ENV === "production" && !localOutboxAllowed()) throw new Error("SMTP is not configured; production cannot send account emails");
  else transport = devOutbox();
  return transport;
}

export function resetTransportForTests() {
  transport = undefined;
  memoryOutbox.length = 0;
}
