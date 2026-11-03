import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { getSessionFromCtx } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins/two-factor";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import * as schema from "../db/schema";
import { session as sessionTable, user as userTable } from "../db/schema";
import { googleConfigured, serverEnv } from "../env";
import { sendAlertInBackground, sendInBackground } from "../email/send";
import { SESSION_MAX_AGE_SECONDS } from "../policy/permissions";
import { audit } from "../services/audit";
import { claimOncePerWindow, consume, LIMITS, releaseAttempt, reserveAttempt, signInAccountKey, signInBrowserKey, THROTTLES } from "../services/rate-limit";
import { log } from "../security/log";
import { hashEmail } from "../security/hash";
import { CLIENT_IP_HEADER, clientIpConfig, clientIpOf } from "../security/client-ip";
import {
  addRecognisedBrowserToken,
  issueRecognisedBrowserToken,
  readCookie,
  recognisedBrowserCookieName,
  recognisedBrowserCookieOptions,
  recognisedBrowserId,
} from "./recognised-browser";
import { signupAllowed, signupPolicy, warnIfMisconfigured } from "./signup-allowlist";
import {
  BLOCKED_TWO_FACTOR_PATHS,
  parseSecondFactor,
  PATHS_NEEDING_SECOND_FACTOR,
  SESSION_PATHS_WITH_SECOND_FACTOR,
  TOTP_ISSUER,
  TWO_FACTOR_CHALLENGE_SECONDS,
  TWO_FACTOR_LIMITS,
  TWO_FACTOR_LOCKOUT,
} from "./two-factor-policy";

/**
 * Better Auth configuration (architecture §2, §8.1; Phase 4a adjustments).
 *
 * - Email + password with required verification (24 h links) and reset (1 h links).
 * - Verification identifiers stored hashed; OAuth tokens encrypted at rest.
 * - Sessions in MariaDB, HttpOnly cookies, 7 days for members (staff 12 h, enforced in session.ts).
 *   No cookie cache: a revoked session or role takes effect on the next request.
 * - Rate limits stored in MariaDB (single Node process, no Redis).
 * - Google sign-in only when both env vars are set; it never grants membership or staff roles.
 * - Staff-only sign-up (Phase 6a): every new user, by any sign-up method, must be on
 *   NLTAG_SIGNUP_ALLOWLIST (signup-allowlist.ts). A refused address gets Better Auth's generic
 *   "already registered" response (403 from the create hook → identical synthetic user), so
 *   the response does not reveal whether an address is listed. No row, no email.
 * - Two-factor (Phase 6b, docs/backend/data-and-auth.md → "Two-factor"): Better Auth's two-factor
 *   plugin with authenticator apps (TOTP) and single-use recovery codes, both stored encrypted.
 *   Required for Church Admins (two-factor-policy.ts, permissions.ts). The hooks below add what
 *   the plugin leaves open: turning it off or replacing recovery codes needs password AND a
 *   current code; "trust this device" is refused; the secret is never shown again after
 *   enrollment; no endpoint other than the challenge can create a session for an enrolled
 *   account; enrollment signs out every other device; every step is audited.
 * - Client IP (security fix, Nov 2026, docs/backend/client-ip.md): Better Auth keys its limits on
 *   x-nltag-client-ip only, which src/server/security/client-ip.ts sets from the CDN's headers (or leaves
 *   out, so the request is counted in the shared per-path bucket: fail closed).
 * - Sign-in protection (Nov 2026, docs/backend/data-and-auth.md → "Sign-in protection"): every
 *   password check is reserved atomically per account BEFORE it runs, on a progressive-delay
 *   schedule (never an indefinite lock). A recognised browser has its own budget, so knowing an
 *   address is not enough to lock its owner out. Correct passwords give the reservation back.
 */
function createAuth() {
  const env = serverEnv();
  const google = googleConfigured(env);
  const isProd = env.NODE_ENV === "production";
  const rateLimitOn = env.AUTH_RATE_LIMIT === "on";
  warnAboutClientIp(isProd);

  return betterAuth({
    appName: "NLTAG",
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(getDb(), { provider: "mysql", schema }),
    trustedOrigins: [new URL(env.BETTER_AUTH_URL).origin],

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        sendInBackground("reset", user.email, url, user.id);
      },
      onPasswordReset: async ({ user }) => {
        await audit({ actorUserId: user.id, action: "auth.password.reset", entity: "user", entityId: user.id });
      },
    },

    emailVerification: {
      sendOnSignUp: true,
      // An unverified user who tries to sign in gets a fresh link (still rate-limited per address).
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: 24 * 60 * 60,
      sendVerificationEmail: async ({ user, url }) => {
        sendInBackground("verify", user.email, url, user.id);
      },
      afterEmailVerification: async (user) => {
        await audit({ actorUserId: user.id, action: "auth.email.verify", entity: "user", entityId: user.id });
      },
    },

    socialProviders: google
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID!,
            clientSecret: env.GOOGLE_CLIENT_SECRET!,
            // Only the profile and email; no Drive, Gmail or contacts scopes.
            scope: ["openid", "email", "profile"],
            prompt: "select_account",
          },
        }
      : {},

    account: {
      encryptOAuthTokens: true,
      accountLinking: {
        enabled: true,
        trustedProviders: ["google"],
        // An attacker who pre-registers an unverified account at someone's address must never
        // receive that person's Google identity.
        requireLocalEmailVerified: true,
      },
    },

    session: {
      expiresIn: SESSION_MAX_AGE_SECONDS.member,
      updateAge: 24 * 60 * 60,
      cookieCache: { enabled: false },
    },

    verification: { storeIdentifier: "hashed" },

    rateLimit: {
      enabled: rateLimitOn,
      storage: "database",
      modelName: "rateLimit",
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/email": { window: 15 * 60, max: 5 },
        "/sign-up/email": { window: 60 * 60, max: 5 },
        "/send-verification-email": { window: 60 * 60, max: 3 },
        "/request-password-reset": { window: 60 * 60, max: 3 },
        "/reset-password": { window: 15 * 60, max: 5 },
        "/verify-email": { window: 15 * 60, max: 10 },
        "/sign-in/social": { window: 15 * 60, max: 10 },
        // Two-factor challenge after a correct password (the plugin also locks the account's
        // second factor after 5 wrong codes in a row, and each challenge allows 5 tries).
        "/two-factor/verify-totp": { window: 15 * 60, max: 10 },
        "/two-factor/verify-backup-code": { window: 15 * 60, max: 5 },
        "/two-factor/enable": { window: 60 * 60, max: 5 },
        "/two-factor/disable": { window: 60 * 60, max: 5 },
        "/two-factor/generate-backup-codes": { window: 60 * 60, max: 5 },
        "/get-session": false,
      },
    },

    advanced: {
      cookiePrefix: "nltag",
      // Explicit: Better Auth skips these checks when NODE_ENV=test by default, which would let
      // the CSRF tests pass vacuously. They are on everywhere.
      disableOriginCheck: false,
      disableCSRFCheck: false,
      useSecureCookies: isProd,
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", secure: isProd, path: "/" },
      // Only the internal header set by client-ip.ts. No trustedProxies: the chain is walked there.
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
      database: { generateId: "uuid" },
    },

    telemetry: { enabled: false },

    databaseHooks: {
      user: {
        create: {
          before: async (u) => {
            const policy = signupPolicy();
            warnIfMisconfigured(policy);
            // Better Auth turns a 403 here into its generic duplicate-address response.
            if (!signupAllowed(u.email, policy)) throw new APIError("FORBIDDEN");
            return { data: u };
          },
          after: async (u) => {
            await audit({ actorUserId: u.id, action: "auth.user.create", entity: "user", entityId: u.id });
          },
        },
        update: {
          after: async (u, ctx) => {
            const path = ctx?.path;
            const updated = u as { id: string; twoFactorEnabled?: boolean };
            if (path === "/two-factor/verify-totp" && updated.twoFactorEnabled) {
              // Enrollment completed. The plugin then creates a fresh session for this browser and
              // deletes the old one; ending every session here first means a session opened with
              // the password alone (before two-factor existed) cannot outlive enrollment.
              await getDb().delete(sessionTable).where(eq(sessionTable.userId, updated.id));
              await audit({ actorUserId: updated.id, action: "auth.2fa.enable", entity: "user", entityId: updated.id }, { required: true });
            }
            if (path === "/two-factor/disable" && updated.twoFactorEnabled === false) {
              await audit({ actorUserId: updated.id, action: "auth.2fa.disable", entity: "user", entityId: updated.id }, { required: true });
            }
          },
        },
      },
      session: {
        create: {
          before: async (s, ctx) => {
            // An enrolled account gets a session only through the two-factor challenge (or from an
            // endpoint that needs a session the challenge created). Blocks, for example, the
            // automatic sign-in after an emailed link and any social sign-in for these accounts.
            const path = ctx?.path;
            if (!path || SESSION_PATHS_WITH_SECOND_FACTOR.has(path)) return;
            const [u] = await getDb().select({ on: userTable.twoFactorEnabled }).from(userTable).where(eq(userTable.id, s.userId));
            if (!u?.on) return;
            await audit({ actorUserId: s.userId, action: "auth.2fa.bypass_blocked", outcome: "DENIED", entity: "session", reason: path.slice(0, 100), ip: s.ipAddress });
            return false;
          },
          after: async (s, ctx) => {
            // reason = the endpoint that signed the person in (for example two-factor/verify-totp).
            await audit({ actorUserId: s.userId, action: "auth.session.create", entity: "session", entityId: s.id, ip: s.ipAddress, reason: ctx?.path?.slice(1, 100) ?? null });
          },
        },
      },
    },

    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const path = ctx.path;
        if (path === "/sign-in/email") {
          await reserveSignInAttempt(ctx.context, ctx.body, ctx.headers, clientIpOf(ctx.headers), isProd);
          return;
        }
        if (!path?.startsWith("/two-factor/")) return;
        if (BLOCKED_TWO_FACTOR_PATHS.has(path)) throw new APIError("NOT_FOUND");
        const body = (ctx.body ?? {}) as Record<string, unknown>;
        // Every sign-in of an enrolled account asks for a code; no 30-day "trusted device" cookie.
        if ((path === "/two-factor/verify-totp" || path === "/two-factor/verify-backup-code") && body.trustDevice) {
          throw new APIError("BAD_REQUEST", { message: "Trusted devices are not available.", code: "TRUST_DEVICE_NOT_ALLOWED" });
        }
        // Authenticator apps only (no emailed codes).
        if (path === "/two-factor/enable" && body.method !== undefined && body.method !== "totp") {
          throw new APIError("BAD_REQUEST", { message: "Only authenticator apps are supported.", code: "TOTP_ONLY" });
        }
        if (PATHS_NEEDING_SECOND_FACTOR.has(path)) {
          // The plugin checks the password; this adds a current authenticator or recovery code.
          const current = await getSessionFromCtx(ctx);
          if (!current) throw new APIError("UNAUTHORIZED");
          await requireCurrentSecondFactor(ctx.headers ?? new Headers(), current.user.id, body.code, path, clientIpOf(ctx.headers));
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        const returned = ctx.context.returned;
        const failed = returned instanceof APIError;
        const ip = clientIpOf(ctx.headers);
        const sessionUserId = ctx.context.session?.user.id ?? null;
        if (ctx.path === "/two-factor/enable" && !failed) {
          await audit({ actorUserId: sessionUserId, action: "auth.2fa.enroll_start", entity: "user", entityId: sessionUserId, ip });
        }
        if ((ctx.path === "/two-factor/verify-totp" || ctx.path === "/two-factor/verify-backup-code") && failed) {
          // Sign-in challenges have no session yet, so the row has no actor; the IP hash is kept.
          await audit({ actorUserId: sessionUserId, action: "auth.2fa.verify_fail", outcome: "DENIED", entity: "auth", ip, reason: failureReason(ctx.path, returned) });
        }
        if (ctx.path === "/two-factor/verify-backup-code" && !failed) {
          const id = (returned as { user?: { id?: string } } | null)?.user?.id ?? ctx.context.newSession?.user.id ?? sessionUserId;
          await audit({ actorUserId: id, action: "auth.2fa.recovery_code.use", entity: "user", entityId: id, ip });
        }
        if (ctx.path === "/two-factor/generate-backup-codes" && !failed) {
          await audit({ actorUserId: sessionUserId, action: "auth.2fa.recovery_codes.regenerate", entity: "user", entityId: sessionUserId, ip }, { required: true });
        }
        if ((ctx.path === "/two-factor/disable" || ctx.path === "/two-factor/generate-backup-codes" || ctx.path === "/two-factor/enable") && failed) {
          await audit({ actorUserId: sessionUserId, action: "auth.2fa.manage_fail", outcome: "DENIED", entity: "user", entityId: sessionUserId, ip, reason: failureReason(ctx.path, returned) });
        }
        if (ctx.path === "/sign-in/email") await settleSignInAttempt(ctx.context, returned);
        // A complete sign-in (the password alone is not complete for an enrolled account) makes
        // this browser recognised for that address.
        const signedIn = ctx.context.newSession?.user;
        if (!failed && signedIn && (COMPLETE_SIGN_IN_PATHS.has(ctx.path ?? "") || (ctx.path === "/sign-in/email" && !(signedIn as { twoFactorEnabled?: boolean | null }).twoFactorEnabled))) {
          const name = recognisedBrowserCookieName(isProd);
          const value = addRecognisedBrowserToken(readCookie(ctx.headers?.get("cookie"), name), issueRecognisedBrowserToken(hashEmail(signedIn.email)));
          ctx.setCookie(name, value, recognisedBrowserCookieOptions(isProd));
        }
        if (ctx.path === "/sign-in/email" && returned instanceof APIError) {
          // No email in the audit row: the attempt is recorded by IP hash only.
          await audit({ action: "auth.sign_in.fail", outcome: "DENIED", entity: "auth", ip, reason: String(returned.status) });
        }
        if ((ctx.path === "/revoke-session" || ctx.path === "/revoke-other-sessions" || ctx.path === "/revoke-sessions") && !(returned instanceof APIError)) {
          await audit({ actorUserId: ctx.context.session?.user.id ?? null, action: "auth.session.revoke", entity: "session", reason: ctx.path.slice(1) });
        }
        if (ctx.path === "/change-password" && !(returned instanceof APIError)) {
          const id = ctx.context.session?.user.id ?? null;
          await audit({ actorUserId: id, action: "auth.password.change", entity: "user", entityId: id });
        }
      }),
    },

    plugins: [
      twoFactor({
        issuer: TOTP_ISSUER,
        // Authenticator app: 6 digits, 30-second steps (the app default everywhere).
        totpOptions: { digits: 6, period: 30 },
        // 10 single-use recovery codes, stored encrypted; a used code is removed atomically.
        backupCodeOptions: { amount: 10, length: 10, storeBackupCodes: "encrypted" },
        // The first code must be confirmed before two-factor counts as on (plugin default, explicit).
        skipVerificationOnEnable: false,
        allowPasswordless: false,
        twoFactorCookieMaxAge: TWO_FACTOR_CHALLENGE_SECONDS,
        // Trusted devices are refused in the before hook; keep the cookie lifetime minimal anyway.
        trustDeviceMaxAge: 1,
        accountLockout: { enabled: true, ...TWO_FACTOR_LOCKOUT },
      }),
      // Keeps Set-Cookie working when auth calls are made from server actions. Must stay last.
      nextCookies(),
    ],
  });
}

/** The address from a sign-in body, or null when there is none to key on. */
function signInEmail(body: unknown): string | null {
  const email = (body as { email?: unknown } | null)?.email;
  return typeof email === "string" && email.trim() !== "" && email.length <= 320 ? email : null;
}

/** Sign-in paths that create the session itself (the end of a complete sign-in). */
const COMPLETE_SIGN_IN_PATHS = new Set(["/two-factor/verify-totp", "/two-factor/verify-backup-code"]);

/** Reservation made by the before hook, keyed on this request's context object (same in both hooks). */
const reservations = new WeakMap<object, string>();

/**
 * Reserves this password check BEFORE Better Auth runs it (H1): one conditional UPDATE under a row
 * lock, so a burst of any size gets at most `free` checks. Refused → 429 before any password work.
 * The budget is the recognised browser's own when this browser holds a valid token for this
 * address, otherwise the address's shared budget. Same behaviour for addresses with no account.
 */
async function reserveSignInAttempt(context: object, body: unknown, headers: Headers | undefined, ip: string | null, isProd: boolean) {
  const email = signInEmail(body);
  if (!email) return; // Better Auth refuses the request (400) before any password check.
  const emailHash = hashEmail(email);
  const browserId = recognisedBrowserId(readCookie(headers?.get("cookie"), recognisedBrowserCookieName(isProd)), emailHash);
  const budget = browserId ? "recognised-browser" : "account";
  const key = browserId ? signInBrowserKey(browserId) : signInAccountKey(emailHash);
  const result = await reserveAttempt(key, browserId ? THROTTLES.signInRecognisedBrowser : THROTTLES.signInAccount);
  if (result.allowed) {
    reservations.set(context, key);
    return;
  }
  // L3: one audit row (and one alert) per address per hour, however many refusals.
  if (await claimOncePerWindow(`signin-refused:${emailHash}`, LIMITS.signInRefusalAudit)) {
    await audit({ action: "auth.sign_in.throttled", outcome: "DENIED", entity: "auth", ip, reason: budget });
    log("warn", "security.sign_in_throttled", { account: emailHash.slice(0, 12), budget, retryAfterSeconds: result.retryAfterSeconds });
    if (budget === "account") await alertAccountHolder(email, emailHash);
  }
  throw new APIError(
    "TOO_MANY_REQUESTS",
    { message: "Too many attempts. Please try again later.", code: "TOO_MANY_ATTEMPTS" },
    { "Retry-After": String(result.retryAfterSeconds) },
  );
}

/**
 * Keeps the reservation only when the password check failed (401: wrong address or password).
 * Anything else — a correct password (with or without a two-factor step), unverified email,
 * validation error — gives it back, so the account holder's own sign-ins cost nothing.
 */
async function settleSignInAttempt(context: object, returned: unknown) {
  const key = reservations.get(context);
  if (!key) return;
  reservations.delete(context);
  if (returned instanceof APIError && returned.statusCode === 401) return;
  await releaseAttempt(key);
}

/**
 * Tells the account holder (at most once a day, only if the account exists) that unfamiliar
 * browsers are being slowed down. In the background, so the response does not depend on it.
 */
async function alertAccountHolder(email: string, emailHash: string) {
  const first = await claimOncePerWindow(`signin-alert-mail:${emailHash}`, LIMITS.signInAlertEmail);
  const [row] = await getDb().select({ id: userTable.id, email: userTable.email }).from(userTable).where(eq(userTable.email, email.trim().toLowerCase())).limit(1);
  if (first && row) sendAlertInBackground("signin-throttled", row.email, row.id);
}

let clientIpWarned = false;
/** Once per process: say (without values) when per-visitor limits cannot work. */
function warnAboutClientIp(isProd: boolean) {
  if (clientIpWarned) return;
  clientIpWarned = true;
  const c = clientIpConfig();
  if (c.problem === "crosscheck-none-in-production") log("warn", "client_ip.config_invalid", { problem: c.problem, note: "CLIENT_IP_CROSSCHECK=none is not allowed in production; every visitor shares one rate-limit bucket per path" });
  else if (c.invalid) log("warn", "client_ip.config_invalid", { problem: c.problem, note: "CLIENT_IP_* not understood; every visitor shares one rate-limit bucket per path" });
  else if (isProd && c.source === "none") log("warn", "client_ip.resolution_off", { note: "CLIENT_IP_SOURCE unset; every visitor shares one rate-limit bucket per path" });
}

/** "two-factor/verify-totp:401:INVALID_CODE" — status and Better Auth error code only, no input. */
function failureReason(path: string, error: APIError): string {
  const code = (error.body as { code?: unknown } | undefined)?.code;
  return `${path.slice(1)}:${error.statusCode}${typeof code === "string" ? `:${code.slice(0, 60)}` : ""}`;
}

/**
 * Turning two-factor off or replacing recovery codes needs a current second factor as well as the
 * password (owner requirement). Uses the plugin's own verification on the caller's session: an
 * authenticator code, or one recovery code (which is then used up). At most 5 attempts per
 * account per 15 minutes, counted in MariaDB so server actions are limited too.
 */
async function requireCurrentSecondFactor(headers: Headers, userId: string, raw: unknown, path: string, ip: string | null) {
  const limit = await consume(`2fa-manage:${userId}`, TWO_FACTOR_LIMITS.manage);
  if (!limit.allowed) {
    await audit({ actorUserId: userId, action: "auth.2fa.manage_fail", outcome: "DENIED", entity: "user", entityId: userId, ip, reason: `${path.slice(1)}:429` });
    throw new APIError("TOO_MANY_REQUESTS", { message: "Too many attempts. Try again later.", code: "TOO_MANY_ATTEMPTS" });
  }
  const parsed = parseSecondFactor(raw);
  let ok = false;
  if (parsed) {
    try {
      if (parsed.kind === "totp") await getAuth().api.verifyTOTP({ headers, body: { code: parsed.code } });
      else await getAuth().api.verifyBackupCode({ headers, body: { code: parsed.code, disableSession: true } });
      ok = true;
    } catch (error) {
      if (!(error instanceof APIError)) throw error;
    }
  }
  if (!ok) {
    await audit({ actorUserId: userId, action: "auth.2fa.manage_fail", outcome: "DENIED", entity: "user", entityId: userId, ip, reason: `${path.slice(1)}:second-factor` });
    throw new APIError("UNAUTHORIZED", { message: "The code is not correct.", code: "INVALID_SECOND_FACTOR" });
  }
}

export type Auth = ReturnType<typeof createAuth>;

let instance: Auth | undefined;

/** Lazily created so builds and static pages never need auth secrets. */
export function getAuth(): Auth {
  instance ??= createAuth();
  return instance;
}

export function resetAuthForTests() {
  instance = undefined;
}
