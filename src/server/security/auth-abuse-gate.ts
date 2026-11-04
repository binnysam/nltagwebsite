import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/client";
import { rateLimitBucket, user as userTable, verification as verificationTable } from "../db/schema";
import { serverEnv } from "../env";
import { sendAlertInBackground } from "../email/send";
import { audit } from "../services/audit";
import {
  claimOncePerWindow,
  LIMITS,
  purgeExpiredBucketsSometimes,
  releaseAttempt,
  reserveAttempt,
  releaseWindow,
  reserveWindow,
  signInAccountKey,
  signInBrowserKey,
  THROTTLES,
} from "../services/rate-limit";
import { getAuth } from "../auth/auth";
import { readCookie, recognisedBrowserCookieName, recognisedBrowserId } from "../auth/recognised-browser";
import { normaliseEmail, signupAllowed, signupPolicy } from "../auth/signup-allowlist";
import { clientIpOf } from "./client-ip";
import { hashEmail } from "./hash";
import { log } from "./log";
import { ProcessLimiter } from "./process-limiter";
import { matchAuthRoute, type AuthRoute } from "./auth-routes";

/**
 * R4 v6 auth abuse gate. Runs in /api/auth before Better Auth, for every request:
 *   1. default deny: method + exact path must be in AUTH_ROUTES, else the gate's own 404;
 *   2. the route's policy (below). No policy ever keys on a client IP (CLIENT_IP_SOURCE unset).
 *
 * Better Auth's own limiter is off (auth.ts). Budgets that must hold across processes live in
 * MariaDB (reserveAttempt / reserveWindow); in-memory ProcessLimiter instances are backstops only
 * and never see an address, so they cannot become an account oracle.
 */

/** Per-process limits (D11). Valid reset links never touch `invalidToken`. */
export const GATE_LIMITS = {
  invalidToken: { ratePerSecond: 20, burst: 40 },
  secondFactor: { ratePerSecond: 50, burst: 100 },
  session: { ratePerSecond: 50, burst: 100 },
} as const;

/**
 * Timing floors (R8 / D16). Every failed sign-in (401 or 429) and every reset request is answered
 * no earlier than this after the request arrived, whether or not the address has an account, so
 * the time an answer takes says nothing about the address. Must stay above the slowest normal
 * wrong-password answer (Better Auth's scrypt verify); a slower one is logged.
 */
export const TIMING_FLOOR_MS = { signInFailure: 400, resetRequest: 250 } as const;

/**
 * Class ceilings (retained from v3/v4, D12): after the per-subject delay, every WRONG-password check
 * also takes a slot in its class's fixed windows, reserved by conditional UPDATE (never consume()).
 * K = an address's own budget, A = a recognised browser's budget. When A is full, the attempt falls
 * back to the address's K budget (A-to-K fallback) instead of being refused, so a recognised owner is
 * never blocked by the A ceiling. Correct passwords give every slot back.
 */
export const CLASS_CEILINGS = {
  K: [{ window: 15 * 60, max: 90 }, { window: 3600, max: 120 }],
  A: [{ window: 15 * 60, max: 60 }, { window: 3600, max: 200 }],
} as const;
type ClassName = keyof typeof CLASS_CEILINGS;
interface Held { key: string; windowStart: number }

async function reserveClass(cls: ClassName): Promise<{ allowed: true; held: Held[] } | { allowed: false; retryAfterSeconds: number }> {
  const held: Held[] = [];
  for (const rule of CLASS_CEILINGS[cls]) {
    const key = `class:${cls}:${rule.window}`;
    const r = await reserveWindow(key, rule);
    if (!r.allowed) {
      for (const h of held) await releaseWindow(h.key, h.windowStart);
      return { allowed: false, retryAfterSeconds: r.retryAfterSeconds };
    }
    held.push({ key, windowStart: r.windowStart });
  }
  return { allowed: true, held };
}

/** Read-only: is the K ceiling full right now? Unknown addresses then get the same 429 as known ones. */
async function kCeilingFull(): Promise<number | null> {
  const now = Date.now();
  for (const rule of CLASS_CEILINGS.K) {
    const windowMs = rule.window * 1000;
    const start = Math.floor(now / windowMs) * windowMs;
    const [row] = await getDb()
      .select({ count: rateLimitBucket.count })
      .from(rateLimitBucket)
      .where(and(eq(rateLimitBucket.bucketKey, `class:K:${rule.window}`), eq(rateLimitBucket.windowStart, start)));
    if ((row?.count ?? 0) >= rule.max) return Math.max(1, Math.ceil((start + windowMs - now) / 1000));
  }
  return null;
}

const limiters = {
  invalidToken: new ProcessLimiter(GATE_LIMITS.invalidToken),
  secondFactor: new ProcessLimiter(GATE_LIMITS.secondFactor),
  session: new ProcessLimiter(GATE_LIMITS.session),
};

/** For tests only: fresh per-process limiters. */
export function resetGateLimitersForTests() {
  limiters.invalidToken = new ProcessLimiter(GATE_LIMITS.invalidToken);
  limiters.secondFactor = new ProcessLimiter(GATE_LIMITS.secondFactor);
  limiters.session = new ProcessLimiter(GATE_LIMITS.session);
}

export const gateCounters = { notFound: 0, signInUnknown: 0, signInKnown: 0, invalidTokenRefused: 0, floorExceeded: 0 };

type Next = (req: Request) => Promise<Response>;

const MAX_BODY_BYTES = 8 * 1024;
const TOKEN_SHAPE = /^[A-Za-z0-9]{24}$/;

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

export const gateNotFound = () => new Response("Not Found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });

/** Better Auth's own wrong-address-or-password answer (checked against it in r4-timing.test.ts). */
const invalidCredentials = () => json(401, { message: "Invalid email or password", code: "INVALID_EMAIL_OR_PASSWORD" });
const tooMany = (retryAfterSeconds: number) =>
  json(429, { message: "Too many attempts. Please try again later.", code: "TOO_MANY_ATTEMPTS" }, { "Retry-After": String(retryAfterSeconds) });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Adaptive part of the sign-in floor (R8 under load). The fixed floor holds only while the CPU has
 * headroom: under a saturating flood a real password check takes longer than the floor, so known
 * addresses would answer slower than unknown ones. The gate therefore keeps the last 32 measured
 * password-work durations (real checks, plus "calibration" dummy hashes that unknown-address
 * requests run at most CALIBRATION_PER_SECOND times a second per process) and holds every failed
 * sign-in until  common work + 1.1 × the largest recent password-work duration, never less than
 * the fixed floor. Under load every failure gets slower together; no address answers differently.
 */
const WORK_SAMPLES = 32;
const CALIBRATION_PER_SECOND = 4;
const workSamples: number[] = [];
let lastCalibration = 0;
function recordWork(ms: number) {
  workSamples.push(ms);
  if (workSamples.length > WORK_SAMPLES) workSamples.shift();
}
const expectedWorkMs = () => (workSamples.length ? Math.max(...workSamples) * 1.1 : 0);
export function resetTimingEstimatorForTests() {
  workSamples.length = 0;
  lastCalibration = 0;
}
/** A dummy password hash timed like Better Auth's own unknown-user path. At most 4 per second. */
async function maybeCalibrate() {
  const now = performance.now();
  if (now - lastCalibration < 1000 / CALIBRATION_PER_SECOND) return;
  lastCalibration = now;
  const t0 = performance.now();
  await hashPassword(randomBytes(12).toString("base64url"));
  recordWork(performance.now() - t0);
}

let lastFloorLog = 0;
let floorLogged = 0;

async function holdUntil(started: number, floorMs: number, res: Response, label: string, commonMs = 0): Promise<Response> {
  floorMs = Math.max(floorMs, commonMs + expectedWorkMs());
  const elapsed = performance.now() - started;
  if (elapsed > floorMs) {
    gateCounters.floorExceeded += 1;
    // At most one line a minute, with the count: a flood must not turn into a log flood.
    const now = Date.now();
    if (now - lastFloorLog >= 60_000) {
      log("warn", "security.timing_floor_exceeded", { label, elapsedMs: Math.round(elapsed), floorMs, sinceLastLine: gateCounters.floorExceeded - floorLogged });
      lastFloorLog = now;
      floorLogged = gateCounters.floorExceeded;
    }
  } else await sleep(floorMs - elapsed);
  return res;
}

/** Origin and redirect target checks, at least as strict as Better Auth's (F12: before classifying). */
function sameOrigin(req: Request): boolean {
  const expected = new URL(serverEnv().BETTER_AUTH_URL).origin;
  return req.headers.get("origin") === expected;
}

function localTarget(value: string | undefined): boolean {
  if (value === undefined) return true;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return false;
  return true;
}

/** Reads a small JSON body; null when it is too big, not JSON or not an object. */
async function readJson(req: Request): Promise<{ text: string; value: Record<string, unknown> } | null> {
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return null;
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return null;
  const text = await req.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) return null;
  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? { text, value: value as Record<string, unknown> } : null;
  } catch {
    return null;
  }
}

/** The same request again, with the body we already read. */
const rebuild = (req: Request, text?: string) =>
  new Request(req.url, { method: req.method, headers: req.headers, body: text, redirect: "manual" });

const badRequest = () => json(400, { message: "Invalid request", code: "INVALID_REQUEST" });

/**
 * v6.1 B (enumeration oracle): the address is validated with Better Auth's own rule — z.email(),
 * exactly as given, no trimming or case folding — BEFORE the known-address lookup and before any
 * reservation. A malformed address (padded, no @, wrong type…) therefore gets the gate's one 400 for
 * every address, account or not, and never spends the real address's budget (hashEmail normalises,
 * so " member@x " would otherwise count against "member@x").
 */
const emailField = z.email().max(254);
const signInSchema = z.strictObject({
  email: emailField,
  password: z.string().min(1).max(128),
  callbackURL: z.string().max(512).optional(),
  rememberMe: z.boolean().optional(),
});
const resetRequestSchema = z.strictObject({ email: emailField, redirectTo: z.string().max(512).optional() });
const resetSchema = z.strictObject({ token: z.string().max(64), newPassword: z.string().max(256) });

/**
 * v6.1 B (audit parity): every wrong-address-or-password answer writes the same
 * `auth.sign_in.fail` row, known address or not (b48261d audited every failure). The insert is
 * fire-and-forget so it cannot make one kind of answer slower than the other, and capped per
 * process (5 rows a second) so a flood cannot turn into an audit-table flood: the excess is counted
 * and reported in one summary log line a minute. Tests flush the pending inserts (helpers.call).
 */
export const SIGN_IN_FAIL_AUDIT_LIMIT = { ratePerSecond: 5, burst: 5 } as const;
let auditLimiter = new ProcessLimiter(SIGN_IN_FAIL_AUDIT_LIMIT);
const pendingAudits = new Set<Promise<unknown>>();
let auditsSuppressed = 0;
let auditsSuppressedReported = 0;
let lastAuditSummary = 0;

function auditSignInFailure(req: Request) {
  if (!auditLimiter.take()) {
    auditsSuppressed += 1;
    const now = Date.now();
    if (now - lastAuditSummary >= 60_000) {
      log("warn", "security.sign_in_fail_audit_capped", { suppressedSinceLastLine: auditsSuppressed - auditsSuppressedReported, perSecond: SIGN_IN_FAIL_AUDIT_LIMIT.ratePerSecond });
      lastAuditSummary = now;
      auditsSuppressedReported = auditsSuppressed;
    }
    return;
  }
  const job = audit({ action: "auth.sign_in.fail", outcome: "DENIED", entity: "auth", ip: clientIpOf(req.headers), reason: "UNAUTHORIZED" }).catch(() => undefined);
  pendingAudits.add(job);
  void job.finally(() => pendingAudits.delete(job));
}

/** Tests: wait for queued sign-in failure audits. */
export async function flushGateAuditsForTests() {
  while (pendingAudits.size) await Promise.all([...pendingAudits]);
}
/** Tests: a fresh audit cap. */
export function resetGateAuditCapForTests() {
  auditLimiter = new ProcessLimiter(SIGN_IN_FAIL_AUDIT_LIMIT);
}
export const gateAuditCounters = () => ({ suppressed: auditsSuppressed });

/**
 * v6.1 G1: the two verify routes exist for the sign-in challenge only. Better Auth 1.7.15 also
 * accepts a SESSION cookie on /two-factor/verify-totp and then switches two-factor on for a pending
 * enrollment — an HTTP enrollment lane outside the server action's `2fa-manage` limit. The gate
 * therefore (1) forwards these routes only when the plugin's challenge cookie is present, else its
 * own 404, and (2) strips the session cookies from what it forwards, so Better Auth can only take
 * its challenge path (which then checks the signed challenge cookie itself). Presence alone is not
 * trusted: a forged cookie name with a session would otherwise still reach the session path.
 * Enrollment confirmation exists only as the server action (account/two-factor/actions.ts).
 */
async function authCookieNames() {
  const ctx = await getAuth().$context;
  return {
    challenge: ctx.createAuthCookie("two_factor").name,
    session: [ctx.authCookies.sessionToken.name, ctx.authCookies.sessionData.name, ctx.authCookies.accountData.name],
  };
}

function withoutCookies(req: Request, drop: readonly string[]): Request {
  const header = req.headers.get("cookie");
  if (!header) return req;
  const kept = header
    .split(";")
    .map((p) => p.trim())
    .filter((p) => p && !drop.includes(p.slice(0, Math.max(0, p.indexOf("="))).trim()));
  const headers = new Headers(req.headers);
  if (kept.length) headers.set("cookie", kept.join("; "));
  else headers.delete("cookie");
  return new Request(req, { headers, duplex: "half" } as RequestInit);
}

async function secondFactor(req: Request, next: Next): Promise<Response> {
  const names = await authCookieNames();
  if (!readCookie(req.headers.get("cookie"), names.challenge)) {
    gateCounters.notFound += 1;
    return gateNotFound();
  }
  if (!limiters.secondFactor.take()) return tooMany(limiters.secondFactor.retryAfterSeconds());
  return next(withoutCookies(req, names.session));
}

export async function gateAuthRequest(req: Request, next: Next): Promise<Response> {
  void purgeExpiredBucketsSometimes().catch(() => undefined);
  const url = new URL(req.url);
  const route = matchAuthRoute(req.method, url);
  if (!route) {
    gateCounters.notFound += 1;
    return gateNotFound();
  }
  switch (route.policy) {
    case "signIn":
      return signIn(req, next);
    case "resetRequest":
      return resetRequest(req, next);
    case "token":
      return token(req, route, url, next);
    case "secondFactor":
      return secondFactor(req, next);
    case "session": {
      const limiter = limiters[route.policy];
      if (!limiter.take()) return tooMany(limiter.retryAfterSeconds());
      return next(req);
    }
  }
}

/** True when the address is on the allowlist or already has an account (one indexed SELECT). */
async function isKnown(email: string): Promise<boolean> {
  if (signupPolicy().kind === "allowlist" && signupAllowed(email)) return true;
  const [row] = await getDb().select({ id: userTable.id }).from(userTable).where(eq(userTable.email, normaliseEmail(email))).limit(1);
  return Boolean(row);
}

async function signIn(req: Request, next: Next): Promise<Response> {
  const started = performance.now();
  const body = await readJson(req);
  const parsed = body ? signInSchema.safeParse(body.value) : null;
  if (!body || !parsed?.success) return badRequest();
  if (!sameOrigin(req) || !localTarget(parsed.data.callbackURL)) return json(403, { message: "Invalid origin", code: "INVALID_ORIGIN" });
  const email = parsed.data.email;
  const emailHash = hashEmail(email);
  const isProd = serverEnv().NODE_ENV === "production";
  const browserId = recognisedBrowserId(readCookie(req.headers.get("cookie"), recognisedBrowserCookieName(isProd)), emailHash);
  const known = await isKnown(email);
  if (known) gateCounters.signInKnown += 1;
  else gateCounters.signInUnknown += 1;

  // Same reservation for every address, account or not: identical 429 sequences (no oracle).
  let key = browserId ? signInBrowserKey(browserId) : signInAccountKey(emailHash);
  const reserved = await reserveAttempt(key, browserId ? THROTTLES.signInRecognisedBrowser : THROTTLES.signInAccount);
  if (!reserved.allowed) {
    if (await claimOncePerWindow(`signin-refused:${emailHash}`, LIMITS.signInRefusalAudit)) {
      await audit({ action: "auth.sign_in.throttled", outcome: "DENIED", entity: "auth", ip: clientIpOf(req.headers), reason: browserId ? "recognised-browser" : "account" });
      log("warn", "security.sign_in_throttled", { account: emailHash.slice(0, 12), retryAfterSeconds: reserved.retryAfterSeconds });
      if (!browserId && known) void alertAccountHolder(email, emailHash);
    }
    return holdUntil(started, TIMING_FLOOR_MS.signInFailure, tooMany(reserved.retryAfterSeconds), "sign-in-429");
  }
  const commonMs = performance.now() - started;

  // Unknown address: Better Auth would only hash a dummy password and answer 401. The gate answers
  // the same without the hash, so a flood of unknown addresses costs no password work at all.
  if (!known) {
    // Same answer a known address gets while the K ceiling is full (no status oracle under load).
    const full = await kCeilingFull();
    if (full !== null) {
      await releaseAttempt(key);
      return holdUntil(started, TIMING_FLOOR_MS.signInFailure, tooMany(full), "sign-in-ceiling", commonMs);
    }
    await maybeCalibrate();
    auditSignInFailure(req);
    return holdUntil(started, TIMING_FLOOR_MS.signInFailure, invalidCredentials(), "sign-in-unknown", commonMs);
  }

  const workStart = performance.now();
  let cls = await reserveClass(browserId ? "A" : "K");
  if (!cls.allowed && browserId) {
    // A-to-K fallback: the recognised browser's class is full; charge the address's own K budget.
    await releaseAttempt(key);
    key = signInAccountKey(emailHash);
    const k = await reserveAttempt(key, THROTTLES.signInAccount);
    if (!k.allowed) return holdUntil(started, TIMING_FLOOR_MS.signInFailure, tooMany(k.retryAfterSeconds), "sign-in-429", commonMs);
    cls = await reserveClass("K");
  }
  if (!cls.allowed) {
    await releaseAttempt(key);
    return holdUntil(started, TIMING_FLOOR_MS.signInFailure, tooMany(cls.retryAfterSeconds), "sign-in-ceiling", commonMs);
  }
  const res = await next(rebuild(req, body.text));
  recordWork(performance.now() - workStart);
  if (res.status !== 401) {
    await releaseAttempt(key);
    for (const h of cls.held) await releaseWindow(h.key, h.windowStart);
    return res;
  }
  // Same queued row as the unknown-address path (v6.1 audit parity); never awaited here.
  auditSignInFailure(req);
  return holdUntil(started, TIMING_FLOOR_MS.signInFailure, res, "sign-in-known", commonMs);
}

async function alertAccountHolder(email: string, emailHash: string) {
  const first = await claimOncePerWindow(`signin-alert-mail:${emailHash}`, LIMITS.signInAlertEmail);
  const [row] = await getDb().select({ id: userTable.id, email: userTable.email }).from(userTable).where(eq(userTable.email, normaliseEmail(email))).limit(1);
  if (first && row) sendAlertInBackground("signin-throttled", row.email, row.id);
}

async function resetRequest(req: Request, next: Next): Promise<Response> {
  const started = performance.now();
  const body = await readJson(req);
  const parsed = body ? resetRequestSchema.safeParse(body.value) : null;
  if (!body || !parsed?.success) return badRequest();
  if (!sameOrigin(req) || !localTarget(parsed.data.redirectTo)) return json(403, { message: "Invalid origin", code: "INVALID_ORIGIN" });
  // Per address, every address alike. Mail itself is capped separately (3 per hour per address).
  const slot = await reserveWindow(`reset-req:${hashEmail(parsed.data.email)}`, LIMITS.resetRequestPerAddress);
  if (!slot.allowed) return holdUntil(started, TIMING_FLOOR_MS.resetRequest, tooMany(slot.retryAfterSeconds), "reset-429");
  const res = await next(rebuild(req, body.text));
  return holdUntil(started, TIMING_FLOOR_MS.resetRequest, res, "reset-request");
}

/** Better Auth stores sha256(identifier), base64url (verification.storeIdentifier = "hashed"). */
const storedIdentifier = (token: string) => createHash("sha256").update(`reset-password:${token}`).digest("base64url");

async function liveResetToken(token: string): Promise<boolean> {
  if (!TOKEN_SHAPE.test(token)) return false;
  const [row] = await getDb()
    .select({ id: verificationTable.id })
    .from(verificationTable)
    .where(and(eq(verificationTable.identifier, storedIdentifier(token)), gt(verificationTable.expiresAt, sql`NOW(3)`)))
    .limit(1);
  return Boolean(row);
}

/**
 * R2: a valid, unexpired link always reaches Better Auth; the backstop limiter applies only to
 * tokens that do not exist. An outsider without the link therefore cannot spend the budget a
 * real link needs. (Each valid link is single-use and capped at 3 mails per address per hour.)
 */
async function token(req: Request, route: AuthRoute, url: URL, next: Next): Promise<Response> {
  let value: string;
  let forward: Request = req;
  if (route.method === "GET") {
    value = url.pathname.slice(url.pathname.lastIndexOf("/") + 1);
  } else {
    const body = await readJson(req);
    const parsed = body ? resetSchema.safeParse(body.value) : null;
    if (!body || !parsed?.success) return badRequest();
    if (!sameOrigin(req)) return json(403, { message: "Invalid origin", code: "INVALID_ORIGIN" });
    value = parsed.data.token;
    forward = rebuild(req, body.text);
  }
  if (await liveResetToken(value)) return next(forward);
  if (!limiters.invalidToken.take()) {
    gateCounters.invalidTokenRefused += 1;
    return tooMany(limiters.invalidToken.retryAfterSeconds());
  }
  return next(forward);
}
