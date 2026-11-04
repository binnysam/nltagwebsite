import { and, eq, gt, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { rateLimitBucket } from "../db/schema";
import { serverEnv } from "../env";
import { registerDrainWaiter } from "../lifecycle";
import { hashEmail } from "../security/hash";
import { log } from "../security/log";
import { audit } from "../services/audit";
import { consume, LIMITS, releaseWindow, reserveWindow } from "../services/rate-limit";
import { renderAlertEmail, renderEmail, type AlertKind, type EmailKind, type RenderedEmail } from "./templates";
import { getTransport } from "./transport";

const HOUR = 3600;
const GLOBAL_KEY = "email:global";

/**
 * v6.1 §2.3: bounded in-process retry for TRANSIENT transport failures only — the connection could
 * not be made or was cut (nodemailer codes below), so the SMTP server never answered. 3 attempts at
 * 0 s, 5 s and 30 s, all under the one reserved mail slot; the slot (and the daily-cap count) is
 * given back only after the final failure. Never retried: anything the server answered with a reply
 * code (any 4xx or 5xx, e.g. 421, 450, 535, 550) and authentication errors (EAUTH), so a
 * misconfigured or refusing server is not hammered. Unknown errors are not retried either.
 */
export const SMTP_RETRY_DELAYS_MS = [0, 5_000, 30_000] as const;
const TRANSIENT_CODES = new Set(["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS", "ECONNRESET", "ECONNREFUSED", "EPIPE"]);

export function isTransientMailError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: unknown; responseCode?: unknown };
  if (typeof e.responseCode === "number") return false; // the server answered: never retry
  return typeof e.code === "string" && TRANSIENT_CODES.has(e.code);
}

let sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
/** Tests: replace the wait between attempts (and observe the delays asked for). */
export function setMailRetrySleepForTests(fn: ((ms: number) => Promise<void>) | null) {
  sleep = fn ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
}

async function sendWithRetry(mail: Parameters<ReturnType<typeof getTransport>["send"]>[0], kind: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await getTransport().send(mail);
      return;
    } catch (error) {
      const next = SMTP_RETRY_DELAYS_MS[attempt + 1];
      if (next === undefined || !isTransientMailError(error)) throw error;
      log("warn", "email.send_retry", { kind, attempt: attempt + 1, delayMs: next });
      await sleep(next);
    }
  }
}

/** Messages sent in the last 24 hours, from hourly buckets (rolling window, not a calendar day). */
async function sentInLast24h(now: number): Promise<number> {
  const since = Math.floor(now / (HOUR * 1000)) * HOUR * 1000 - 23 * HOUR * 1000;
  const [row] = await getDb()
    .select({ total: sql<string>`COALESCE(SUM(${rateLimitBucket.count}), 0)` })
    .from(rateLimitBucket)
    .where(and(eq(rateLimitBucket.bucketKey, GLOBAL_KEY), gt(rateLimitBucket.windowStart, since - 1)));
  return Number(row?.total ?? 0);
}

export type SendOutcome = "sent" | "suppressed" | "failed";

/**
 * Sends one account email, subject to:
 *  - 3 per hour per address and kind (architecture §8.1; addresses are HMAC'd in the key);
 *  - a rolling 24-hour cap (EMAIL_DAILY_CAP, default 300) under Gmail's 500 limit, so an attack
 *    cannot exhaust the church mailbox.
 * Suppressed and failed sends are audited without the address. The caller's HTTP response is the
 * same either way (no account discovery).
 */
export async function sendAccountEmail(kind: EmailKind, to: string, url: string, userId?: string): Promise<SendOutcome> {
  return deliver(kind, to, () => renderEmail(kind, url), userId);
}

/** Security alert to an account holder, under the same per-address and daily caps. */
export async function sendAlertEmail(kind: AlertKind, to: string, userId?: string): Promise<SendOutcome> {
  return deliver(kind, to, () => renderAlertEmail(kind), userId);
}

async function deliver(kind: EmailKind | AlertKind, to: string, render: () => RenderedEmail, userId?: string): Promise<SendOutcome> {
  const now = Date.now();
  // F11: reserve (never consume) so a concurrent burst gets exactly the cap, not zero.
  const slotKey = `email:${kind}:${hashEmail(to)}`;
  const slot = await reserveWindow(slotKey, LIMITS.emailPerAddress, now);
  if (!slot.allowed) {
    await audit({ actorUserId: userId, action: "email.suppress", outcome: "DENIED", entity: "email", reason: `${kind}:per-address-limit` });
    return "suppressed";
  }
  if ((await sentInLast24h(now)) >= serverEnv().EMAIL_DAILY_CAP) {
    await releaseWindow(slotKey, slot.windowStart);
    await audit({ actorUserId: userId, action: "email.suppress", outcome: "DENIED", entity: "email", reason: `${kind}:daily-cap` });
    log("warn", "email.daily_cap_reached", { kind });
    return "suppressed";
  }
  const globalWindow = Math.floor(now / (HOUR * 1000)) * HOUR * 1000;
  await consume(GLOBAL_KEY, { window: HOUR, max: Number.MAX_SAFE_INTEGER }, now, 24 * HOUR);
  try {
    await sendWithRetry({ to, ...render() }, kind);
  } catch (error) {
    // R5: nothing was delivered, so give back the address slot and the daily-cap count. A failure
    // during an SMTP outage must not lock the address out for the rest of the hour.
    await releaseWindow(slotKey, slot.windowStart).catch(() => undefined);
    await releaseWindow(GLOBAL_KEY, globalWindow).catch(() => undefined);
    log("error", "email.send_failed", { kind, error });
    await audit({ actorUserId: userId, action: "email.fail", outcome: "FAILURE", entity: "email", reason: kind });
    return "failed";
  }
  await audit({ actorUserId: userId, action: "email.send", entity: "email", reason: kind });
  return "sent";
}

/**
 * Better Auth awaits its email callbacks. Sending in the background keeps response time the same
 * whether or not an account exists (timing-based account discovery). Tests can await the queue.
 */
const pending = new Set<Promise<unknown>>();

export function sendInBackground(kind: EmailKind, to: string, url: string, userId?: string) {
  const p = sendAccountEmail(kind, to, url, userId).catch((error) => log("error", "email.background_failed", { kind, error }));
  pending.add(p);
  void p.finally(() => pending.delete(p));
}

/** Background alert (same reason as above: the caller's response time must not depend on it). */
export function sendAlertInBackground(kind: AlertKind, to: string, userId?: string) {
  const p = sendAlertEmail(kind, to, userId).catch((error) => log("error", "email.background_failed", { kind, error }));
  pending.add(p);
  void p.finally(() => pending.delete(p));
}

/** Waits for every queued email (shutdown drain; tests). */
export async function waitForEmailQueue() {
  while (pending.size) await Promise.all([...pending]);
}
export const flushEmailQueueForTests = waitForEmailQueue;
registerDrainWaiter("email-queue", waitForEmailQueue);
