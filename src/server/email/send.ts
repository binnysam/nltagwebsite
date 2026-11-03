import { and, eq, gt, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { rateLimitBucket } from "../db/schema";
import { serverEnv } from "../env";
import { hashEmail } from "../security/hash";
import { log } from "../security/log";
import { audit } from "../services/audit";
import { consume, LIMITS } from "../services/rate-limit";
import { renderAlertEmail, renderEmail, type AlertKind, type EmailKind, type RenderedEmail } from "./templates";
import { getTransport } from "./transport";

const HOUR = 3600;
const GLOBAL_KEY = "email:global";

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
  const perAddress = await consume(`email:${kind}:${hashEmail(to)}`, LIMITS.emailPerAddress, now);
  if (!perAddress.allowed) {
    await audit({ actorUserId: userId, action: "email.suppress", outcome: "DENIED", entity: "email", reason: `${kind}:per-address-limit` });
    return "suppressed";
  }
  if ((await sentInLast24h(now)) >= serverEnv().EMAIL_DAILY_CAP) {
    await audit({ actorUserId: userId, action: "email.suppress", outcome: "DENIED", entity: "email", reason: `${kind}:daily-cap` });
    log("warn", "email.daily_cap_reached", { kind });
    return "suppressed";
  }
  await consume(GLOBAL_KEY, { window: HOUR, max: Number.MAX_SAFE_INTEGER }, now, 24 * HOUR);
  try {
    await getTransport().send({ to, ...render() });
    await audit({ actorUserId: userId, action: "email.send", entity: "email", reason: kind });
    return "sent";
  } catch (error) {
    log("error", "email.send_failed", { kind, error });
    await audit({ actorUserId: userId, action: "email.fail", outcome: "FAILURE", entity: "email", reason: kind });
    return "failed";
  }
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

export async function flushEmailQueueForTests() {
  while (pending.size) await Promise.all([...pending]);
}
