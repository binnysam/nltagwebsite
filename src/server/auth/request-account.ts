import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/client";
import { account as accountTable, user as userTable } from "../db/schema";
import { serverEnv } from "../env";
import { hashEmail } from "../security/hash";
import { log } from "../security/log";
import { ProcessLimiter } from "../security/process-limiter";
import { isDraining, registerDrainWaiter } from "../lifecycle";
import { audit } from "../services/audit";
import { LIMITS, releaseWindow, reserveWindow } from "../services/rate-limit";
import { getAuth } from "./auth";
import { normaliseEmail, signupAllowed, signupPolicy } from "./signup-allowlist";

/**
 * Mailbox-first account request (R4, D1). The reply is decided before anything about the address
 * is looked at, so it is identical for listed, unlisted, new and existing addresses. Work happens
 * after the reply, and only for listed addresses: a window per address (3 per 15 min, in MariaDB,
 * all processes — v6.1 §1: as many links as the mail cap can deliver), then a set-password link
 * (or, for an existing account, a reset link) under the normal mail caps (3 per address per hour,
 * EMAIL_DAILY_CAP per 24 h).
 *
 * v6.1 §2 reliability, no migration: a failed provision gives its window slot back; the job is
 * audited (entity id only); shutdown stops new requests and waits for queued ones (lifecycle.ts).
 */
export const ACCOUNT_REQUEST_LIMIT = { ratePerSecond: 5, burst: 20 } as const;
let limiter = new ProcessLimiter(ACCOUNT_REQUEST_LIMIT);
export const resetAccountRequestLimiterForTests = () => {
  limiter = new ProcessLimiter(ACCOUNT_REQUEST_LIMIT);
};

const schema = z.strictObject({ email: z.email().max(254), locale: z.enum(["ta", "en"]) });

const reply = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers } });

const pending = new Set<Promise<unknown>>();
/** Waits for every queued account request (shutdown drain; tests). */
export async function waitForAccountRequests() {
  while (pending.size) await Promise.all([...pending]);
}
export const flushAccountRequestsForTests = waitForAccountRequests;
registerDrainWaiter("account-requests", waitForAccountRequests);

export async function handleAccountRequest(req: Request): Promise<Response> {
  if (req.headers.get("origin") !== new URL(serverEnv().BETTER_AUTH_URL).origin) return reply(403, { code: "INVALID_ORIGIN" });
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return reply(400, { code: "INVALID_REQUEST" });
  const text = await req.text();
  if (Buffer.byteLength(text) > 2048) return reply(400, { code: "INVALID_REQUEST" });
  let parsed;
  try {
    parsed = schema.safeParse(JSON.parse(text));
  } catch {
    return reply(400, { code: "INVALID_REQUEST" });
  }
  if (!parsed.success) return reply(400, { code: "INVALID_REQUEST" });
  // Shutting down: no new background job (address-independent, so still no oracle).
  if (isDraining()) return reply(503, { code: "TRY_AGAIN" }, { "Retry-After": "30" });
  // Address-independent: the same for everyone, so it cannot tell listed from unlisted.
  if (!limiter.take()) return reply(429, { code: "TOO_MANY_REQUESTS" }, { "Retry-After": String(limiter.retryAfterSeconds()) });
  const { email, locale } = parsed.data;
  const job = provision(email, locale).catch((error) => log("error", "account_request.failed", { error }));
  pending.add(job);
  void job.finally(() => pending.delete(job));
  return reply(202, { status: "ok" });
}

async function provision(email: string, locale: "ta" | "en") {
  const policy = signupPolicy();
  if (policy.kind === "closed" || !signupAllowed(email, policy)) return; // no query, no row, no mail
  const windowKey = `acct-req:${hashEmail(email)}`;
  const window = await reserveWindow(windowKey, LIMITS.accountRequestPerAddress);
  if (!window.allowed) return;
  try {
    await provisionWithinWindow(email, locale);
  } catch (error) {
    // §2.2: nothing was issued, so the person's next request must not find the slot used up.
    await releaseWindow(windowKey, window.windowStart).catch(() => undefined);
    throw error;
  }
}

async function provisionWithinWindow(email: string, locale: "ta" | "en") {
  const address = normaliseEmail(email);
  const [existing] = await getDb().select({ id: userTable.id }).from(userTable).where(eq(userTable.email, address)).limit(1);
  if (!existing) {
    const ctx = await getAuth().$context;
    try {
      const created = await ctx.internalAdapter.createUser({ email: address, name: "", emailVerified: false }, { method: "email-password" });
      await audit({ action: "auth.account_request.provisioned", entity: "user", entityId: created.id });
    } catch (error) {
      // A concurrent request created it first (unique index); carry on with the existing row.
      const [again] = await getDb().select({ id: userTable.id }).from(userTable).where(eq(userTable.email, address)).limit(1);
      if (!again) throw error;
    }
  }
  // No password yet → the set-password page (D9 wording); an existing password → the reset page.
  // auth.ts sendResetPassword makes the same distinction for the email itself.
  const [row] = await getDb().select({ id: userTable.id }).from(userTable).where(eq(userTable.email, address)).limit(1);
  const [cred] = row
    ? await getDb().select({ id: accountTable.id }).from(accountTable).where(and(eq(accountTable.userId, row.id), eq(accountTable.providerId, "credential"))).limit(1)
    : [];
  const page = cred ? "reset-password" : "set-password";
  await getAuth().api.requestPasswordReset({ body: { email: address, redirectTo: `/${locale}/${page}` } });
  await audit({ action: "auth.account_request.link_issued", entity: "user", entityId: row?.id ?? null, reason: page });
}
