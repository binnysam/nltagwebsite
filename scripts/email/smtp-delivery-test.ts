// TEMPORARY — SMTP Stage A: one owner-approved test send (docs/operations/smtp-delivery-test.md).
// Called by scripts/hostinger-build.mjs only when NLTAG_APPROVED_SMTP_TEST=1. All rules live in
// src/server/email/smtp-delivery-test.ts. Prints one line; never prints environment values.
import { promises as fs } from "node:fs";
import { describeOutcome, exitCodeFor, runSmtpDeliveryTest, type SmtpTestOutcome } from "../../src/server/email/smtp-delivery-test";
import { accountHome } from "../../src/server/storage/media-dir";

let outcome: SmtpTestOutcome;
try {
  // Imported lazily: the transport validates the whole server environment on first use.
  const { getTransport } = await import("../../src/server/email/transport");
  let appDir = process.cwd();
  try { appDir = await fs.realpath(appDir); } catch { /* keep cwd */ }
  outcome = await runSmtpDeliveryTest({
    env: process.env,
    home: accountHome(),
    appDir,
    get transportName() {
      return getTransport().name;
    },
    send: (mail) => getTransport().send(mail),
  });
} catch (error) {
  // e.g. "Invalid server environment: SMTP_PORT: ..." — names and rules only, never values.
  const message = error instanceof Error ? error.message.split("\n")[0] : "unexpected error";
  outcome = { status: "refused", reason: message.replace(/[^\s@]+@[^\s@]+/g, "[address]") };
}
const line = `[nltag-smtp-test] ${describeOutcome(outcome)}`;
if (exitCodeFor(outcome)) console.error(line);
else console.info(line);
process.exit(exitCodeFor(outcome));
