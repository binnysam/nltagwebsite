import "server-only";
import { z } from "zod";

/**
 * Server environment. Parsed lazily (on first use) so `next build` and pages that never touch
 * the database do not need secrets. Values only ever come from the process environment:
 * locally from `.env.local` (git-ignored), in production from Hostinger environment variables.
 * Never log this object.
 */

const optional = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z
      .string()
      .url()
      .refine((v) => v.startsWith("mysql://"), "DATABASE_URL must be a mysql:// URL (MariaDB speaks the MySQL protocol)"),
    BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
    BETTER_AUTH_URL: z.string().url(),
    GOOGLE_CLIENT_ID: optional,
    GOOGLE_CLIENT_SECRET: optional,
    SMTP_HOST: optional,
    SMTP_PORT: z.coerce.number().int().positive().optional(),
    SMTP_USER: optional,
    SMTP_PASS: optional,
    SMTP_FROM: optional,
    /** Daily cap on outgoing mail, kept below Gmail's 500 recipients per rolling 24 h. */
    EMAIL_DAILY_CAP: z.coerce.number().int().positive().max(450).default(300),
    // Client IP resolution (CLIENT_IP_SOURCE, CLIENT_IP_PROXY_HOPS, CLIENT_IP_CROSSCHECK,
    // CLIENT_IP_SHAPE_LOG) is read by src/server/security/client-ip.ts, which also runs in the
    // request proxy, so it is not part of this schema. TRUSTED_PROXIES is no longer used.
    /** Rate limiting is on everywhere; tests may lower it only through this explicit switch. */
    AUTH_RATE_LIMIT: z.enum(["on", "off"]).default("on"),
  })
  .superRefine((env, ctx) => {
    const google = [env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET].filter(Boolean).length;
    if (google === 1) ctx.addIssue({ code: "custom", message: "Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither" });
    const smtp = [env.SMTP_HOST, env.SMTP_USER, env.SMTP_PASS, env.SMTP_FROM].filter(Boolean).length;
    if (smtp > 0 && smtp < 4) ctx.addIssue({ code: "custom", message: "SMTP needs SMTP_HOST, SMTP_USER, SMTP_PASS and SMTP_FROM together" });
    if (env.NODE_ENV === "production") {
      const url = new URL(env.BETTER_AUTH_URL);
      const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
      if (url.protocol !== "https:" && !local) ctx.addIssue({ code: "custom", message: "BETTER_AUTH_URL must use https in production" });
      if (env.AUTH_RATE_LIMIT === "off") ctx.addIssue({ code: "custom", message: "Rate limiting cannot be switched off in production" });
    }
  });

export type ServerEnv = z.infer<typeof schema>;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const isLoopbackHost = (host: string) => LOOPBACK_HOSTS.has(host.toLowerCase()) || /^127\./.test(host);

/**
 * R4 v6.1 §5: values that exist only for tests, CI or the local two-process harness must never run
 * the real site. Active only when NODE_ENV=production AND BETTER_AUTH_URL is a non-loopback https
 * URL (the deployed site); the harness and `next start` on localhost are unaffected. Returns the
 * names of the offending variables and the rule, never their values. The production database
 * legitimately uses 127.0.0.1 (Hostinger), so the database host is deliberately not checked.
 */
export function productionGuardProblems(env: NodeJS.ProcessEnv): string[] {
  if (env.NODE_ENV !== "production") return [];
  let site: URL;
  try {
    site = new URL(env.BETTER_AUTH_URL ?? "");
  } catch {
    return [];
  }
  if (site.protocol !== "https:" || isLoopbackHost(site.hostname)) return [];
  const problems: string[] = [];
  if ((env.NODE_TLS_REJECT_UNAUTHORIZED ?? "").trim() === "0") problems.push("NODE_TLS_REJECT_UNAUTHORIZED: must not be 0 on the live site");
  const secret = env.BETTER_AUTH_SECRET ?? "";
  if (/test-only|harness-only/i.test(secret)) problems.push("BETTER_AUTH_SECRET: a test or harness secret must not run the live site");
  const db = env.DATABASE_URL ?? "";
  if (/nltag-local-dev-only|ci-only/i.test(db)) problems.push("DATABASE_URL: local-development or CI credentials must not run the live site");
  const smtpHost = (env.SMTP_HOST ?? "").trim();
  if (smtpHost && isLoopbackHost(smtpHost)) problems.push("SMTP_HOST: a loopback mail server must not be used by the live site");
  for (const k of ["SMTP_USER", "SMTP_PASS"] as const) {
    if ((env[k] ?? "").trim().toLowerCase() === "harness") problems.push(`${k}: harness credentials must not be used by the live site`);
  }
  return problems;
}

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // Report variable names and rules only, never values.
    const problems = parsed.error.issues.map((i) => `${i.path.join(".") || "env"}: ${i.message}`).join("; ");
    throw new Error(`Invalid server environment: ${problems}`);
  }
  const guard = productionGuardProblems(process.env);
  if (guard.length) throw new Error(`Invalid server environment: ${guard.join("; ")}`);
  cached = parsed.data;
  return cached;
}

/** For tests that change the environment between cases. */
export function resetServerEnvForTests() {
  cached = undefined;
}

export const smtpConfigured = (env: ServerEnv) => Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS && env.SMTP_FROM);
export const googleConfigured = (env: ServerEnv) => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
