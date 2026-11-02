import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { getDb } from "../db/client";
import * as schema from "../db/schema";
import { googleConfigured, serverEnv } from "../env";
import { sendInBackground } from "../email/send";
import { SESSION_MAX_AGE_SECONDS } from "../policy/permissions";
import { audit } from "../services/audit";

/**
 * Better Auth configuration (architecture §2, §8.1; Phase 4a adjustments).
 *
 * - Email + password with required verification (24 h links) and reset (1 h links).
 * - Verification identifiers stored hashed; OAuth tokens encrypted at rest.
 * - Sessions in MariaDB, HttpOnly cookies, 7 days for members (staff 12 h, enforced in session.ts).
 *   No cookie cache: a revoked session or role takes effect on the next request.
 * - Rate limits stored in MariaDB (single Node process, no Redis).
 * - Google sign-in only when both env vars are set; it never grants membership or staff roles.
 */
function createAuth() {
  const env = serverEnv();
  const google = googleConfigured(env);
  const isProd = env.NODE_ENV === "production";
  const rateLimitOn = env.AUTH_RATE_LIMIT === "on";

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
      ipAddress: {
        ipAddressHeaders: ["x-forwarded-for"],
        ...(env.TRUSTED_PROXIES ? { trustedProxies: env.TRUSTED_PROXIES.split(",").map((s) => s.trim()) } : {}),
      },
      database: { generateId: "uuid" },
    },

    telemetry: { enabled: false },

    databaseHooks: {
      user: {
        create: {
          after: async (u) => {
            await audit({ actorUserId: u.id, action: "auth.user.create", entity: "user", entityId: u.id });
          },
        },
      },
      session: {
        create: {
          after: async (s) => {
            await audit({ actorUserId: s.userId, action: "auth.session.create", entity: "session", entityId: s.id, ip: s.ipAddress });
          },
        },
      },
    },

    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        const returned = ctx.context.returned;
        if (ctx.path === "/sign-in/email" && returned instanceof APIError) {
          // No email in the audit row: the attempt is recorded by IP hash only.
          const ip = ctx.request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
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

    // Keeps Set-Cookie working when auth calls are made from server actions.
    plugins: [nextCookies()],
  });
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
