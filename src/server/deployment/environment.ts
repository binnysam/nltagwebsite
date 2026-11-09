// Deployment environments: production, staging and local (development, tests, CI).
//
// Pure functions only (no I/O, no Next.js, no database), so the request proxy, the Hostinger build
// script, the migration and seed scripts and unit tests all share one definition. The checks that
// need I/O (the live database identity and the media folder) are in ./verify.ts.
//
// Rules (docs/operations/staging.md):
//   - A deployment is STAGING only when NLTAG_DEPLOYMENT=staging. Production keeps working exactly
//     as before when the variable is unset; a site whose address looks like staging but does not
//     say so is refused, so a forgotten variable can never make staging behave like production.
//   - Staging validation fails closed: every problem is reported by variable NAME and rule, never
//     by value, and the server refuses to use the database, media folder or mail until it passes.
//   - These rules never weaken a production rule; productionGuardProblems (src/server/env.ts)
//     still applies to staging, which also runs with NODE_ENV=production.
import path from "node:path";

export type DeploymentKind = "production" | "staging" | "local";

type Env = Record<string, string | undefined>;

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
export const isLoopbackHost = (host: string) => LOOPBACK.has(host.toLowerCase()) || /^127\./.test(host);

/** Prefix every staging BETTER_AUTH_SECRET must carry; a production secret (random) never does. */
export const STAGING_SECRET_PREFIX = "nltag-staging-";
export const STAGING_SECRET_MIN_LENGTH = 48;

/**
 * Mail hosts that only ever capture mail (no delivery to real inboxes). Used only with
 * NLTAG_STAGING_MAIL=sandbox. Gmail and every other real provider are refused in staging.
 */
export const STAGING_SANDBOX_SMTP_HOSTS = ["sandbox.smtp.mailtrap.io", "smtp.ethereal.email"] as const;

/** Reserved domains (RFC 2606 / 6761) that can never be a real person's mailbox. */
export function isReservedTestAddress(address: string): boolean {
  const at = address.lastIndexOf("@");
  if (at < 1) return false;
  const domain = address.slice(at + 1).trim().toLowerCase().replace(/\.$/, "");
  if (!domain) return false;
  if (["example.com", "example.org", "example.net"].includes(domain)) return true;
  return /\.(test|example|invalid)$/.test(domain) || ["test", "example", "invalid"].includes(domain);
}

function siteHost(env: Env): string | null {
  try {
    return new URL(env.BETTER_AUTH_URL ?? "").hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** A host that names itself staging (staging.nltagkuwait.com, nltag-staging.example …). */
export const looksLikeStagingHost = (host: string) => host.split(".").some((label) => /(^|-)staging($|-)/.test(label));

/**
 * The deployment this process belongs to. Only NLTAG_DEPLOYMENT=staging selects staging.
 * Without it, NODE_ENV=production is production (unchanged behaviour) and anything else is local.
 */
export function deploymentKind(env: Env = process.env): DeploymentKind {
  const declared = env.NLTAG_DEPLOYMENT?.trim();
  if (declared === "staging") return "staging";
  if (env.NODE_ENV === "production") return "production";
  return "local";
}

export const isStaging = (env: Env = process.env) => deploymentKind(env) === "staging";

/** Database name from a mysql:// URL, or null when it cannot be read. */
export function databaseNameOf(url: string | undefined): string | null {
  try {
    const u = new URL(url ?? "");
    const name = decodeURIComponent(u.pathname.replace(/^\//, ""));
    return name || null;
  } catch {
    return null;
  }
}

/** Database user from a mysql:// URL, or null. */
export function databaseUserOf(url: string | undefined): string | null {
  try {
    const u = decodeURIComponent(new URL(url ?? "").username);
    return u || null;
  } catch {
    return null;
  }
}

/** The account-level folder production media lives under (<home>/nltag-data). */
export const productionDataRoot = (home: string) => path.join(home, "nltag-data");

const inside = (child: string, parent: string) => {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
};

/** True when the two folders are the same or one contains the other. */
export const pathsOverlap = (a: string, b: string) => inside(a, b) || inside(b, a);

/** A folder path one of whose segments names staging (e.g. /home/u…/nltag-data-staging/media). */
export const pathNamesStaging = (dir: string) => dir.split(path.sep).some((seg) => /(^|[-_])staging($|[-_])/.test(seg));

/**
 * Configuration problems for the deployment described by `env` (names and rules only, never
 * values). Empty = acceptable. Production and local deployments get only the cross-checks that
 * protect them FROM staging values; their existing behaviour is otherwise unchanged.
 */
export function deploymentConfigProblems(env: Env = process.env, home = ""): string[] {
  const kind = deploymentKind(env);
  const declared = env.NLTAG_DEPLOYMENT?.trim();
  const problems: string[] = [];
  if (declared && declared !== "staging" && declared !== "production") {
    problems.push("NLTAG_DEPLOYMENT: must be 'staging', 'production' or unset");
  }
  const host = siteHost(env);
  const secret = env.BETTER_AUTH_SECRET ?? "";
  const dbName = databaseNameOf(env.DATABASE_URL);

  if (kind !== "staging") {
    // A forgotten NLTAG_DEPLOYMENT on the staging app must never make it act as production.
    if (env.NODE_ENV === "production" && host && looksLikeStagingHost(host)) {
      problems.push("NLTAG_DEPLOYMENT: a staging address must set NLTAG_DEPLOYMENT=staging");
    }
    if (kind === "production") {
      if (secret.startsWith(STAGING_SECRET_PREFIX)) problems.push("BETTER_AUTH_SECRET: a staging secret must not run production");
      if (dbName && /staging/i.test(dbName)) problems.push("DATABASE_URL: a staging database must not run production");
      const media = env.NLTAG_MEDIA_DIR?.trim();
      if (media && pathNamesStaging(path.normalize(media))) problems.push("NLTAG_MEDIA_DIR: a staging media folder must not be used by production");
    }
    return problems;
  }

  // ── Staging ──
  if (env.NODE_ENV !== "production") problems.push("NODE_ENV: staging runs a production build (NODE_ENV=production)");
  if (!host) problems.push("BETTER_AUTH_URL: required in staging");
  else {
    const url = new URL(env.BETTER_AUTH_URL as string);
    const local = isLoopbackHost(host);
    if (!local && url.protocol !== "https:") problems.push("BETTER_AUTH_URL: staging must use https");
    if (!local && !looksLikeStagingHost(host)) problems.push("BETTER_AUTH_URL: the staging address must name staging (e.g. staging.nltagkuwait.com)");
  }
  if (!secret.startsWith(STAGING_SECRET_PREFIX) || secret.length < STAGING_SECRET_MIN_LENGTH) {
    problems.push(`BETTER_AUTH_SECRET: staging needs its own secret starting with '${STAGING_SECRET_PREFIX}', at least ${STAGING_SECRET_MIN_LENGTH} characters`);
  }
  if (!dbName) problems.push("DATABASE_URL: staging needs a database name");
  else if (!/staging/i.test(dbName)) problems.push("DATABASE_URL: the staging database name must contain 'staging'");
  const dbUser = databaseUserOf(env.DATABASE_URL);
  if (dbUser && !/staging/i.test(dbUser)) problems.push("DATABASE_URL: the staging database user must contain 'staging' (its own user, no access to production)");

  const media = env.NLTAG_MEDIA_DIR?.trim();
  if (!media) problems.push("NLTAG_MEDIA_DIR: staging must set its own media folder");
  else if (!path.isAbsolute(media)) problems.push("NLTAG_MEDIA_DIR: must be an absolute path");
  else {
    const dir = path.normalize(media);
    if (!pathNamesStaging(dir)) problems.push("NLTAG_MEDIA_DIR: the staging media folder path must name staging (e.g. …/nltag-data-staging/media)");
    if (home && pathsOverlap(dir, productionDataRoot(home))) problems.push("NLTAG_MEDIA_DIR: must not be, contain or sit inside the production data folder");
  }

  // One-off production operations are never allowed in staging.
  if ((env.NLTAG_APPROVED_PRODUCTION_MIGRATION ?? "").trim() !== "") problems.push("NLTAG_APPROVED_PRODUCTION_MIGRATION: not allowed in staging (use NLTAG_STAGING_MIGRATE=1)");
  if ((env.NLTAG_BOOTSTRAP_ADMIN_EMAIL ?? "").trim() !== "") problems.push("NLTAG_BOOTSTRAP_ADMIN_EMAIL: the production admin bootstrap is not allowed in staging");
  const stagingAdmin = (env.NLTAG_STAGING_BOOTSTRAP_ADMIN_EMAIL ?? "").trim();
  if (stagingAdmin && !isReservedTestAddress(stagingAdmin)) problems.push("NLTAG_STAGING_BOOTSTRAP_ADMIN_EMAIL: must be a reserved test address (e.g. …@nltag.test)");

  // The church's Google sign-in client belongs to production.
  if ((env.GOOGLE_CLIENT_ID ?? "").trim() || (env.GOOGLE_CLIENT_SECRET ?? "").trim()) problems.push("GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET: not allowed in staging");

  // Sign-up allowlist: test addresses only, so no real person's details are needed in staging.
  for (const a of (env.NLTAG_SIGNUP_ALLOWLIST ?? "").split(",").map((x) => x.trim()).filter(Boolean)) {
    if (!isReservedTestAddress(a)) {
      problems.push("NLTAG_SIGNUP_ALLOWLIST: staging accepts reserved test addresses only (e.g. …@nltag.test)");
      break;
    }
  }
  const inbox = (env.NLTAG_CHURCH_INBOX ?? "").trim();
  if (inbox && !isReservedTestAddress(inbox)) problems.push("NLTAG_CHURCH_INBOX: staging notifications go to a reserved test address only");

  // Mail: captured to files by default; an SMTP sandbox only when asked for explicitly.
  const mode = stagingMailMode(env);
  const smtpSet = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"].some((k) => (env[k] ?? "").trim() !== "");
  if (mode === null) problems.push("NLTAG_STAGING_MAIL: must be 'capture' (default) or 'sandbox'");
  else if (mode === "capture" && smtpSet) problems.push("SMTP_*: staging captures mail; remove the SMTP variables (or set NLTAG_STAGING_MAIL=sandbox with a sandbox host)");
  else if (mode === "sandbox") {
    const smtpHost = (env.SMTP_HOST ?? "").trim().toLowerCase();
    if (!(STAGING_SANDBOX_SMTP_HOSTS as readonly string[]).includes(smtpHost) && !isLoopbackHost(smtpHost)) {
      problems.push(`SMTP_HOST: staging may only use a mail sandbox (${STAGING_SANDBOX_SMTP_HOSTS.join(", ")})`);
    }
  }
  return problems;
}

export type StagingMailMode = "capture" | "sandbox";

/** capture (default): nothing is sent, messages are written to the staging mail folder. */
export function stagingMailMode(env: Env = process.env): StagingMailMode | null {
  const v = (env.NLTAG_STAGING_MAIL ?? "").trim();
  if (v === "" || v === "capture") return "capture";
  if (v === "sandbox") return "sandbox";
  return null;
}

/** Where captured staging mail is written: NLTAG_STAGING_MAIL_DIR, else next to the media folder. */
export function stagingMailDir(env: Env = process.env): string | null {
  const configured = env.NLTAG_STAGING_MAIL_DIR?.trim();
  if (configured) return path.isAbsolute(configured) ? path.normalize(configured) : null;
  const media = env.NLTAG_MEDIA_DIR?.trim();
  return media && path.isAbsolute(media) ? path.join(path.dirname(path.normalize(media)), "mail-capture") : null;
}

/** Short label for the visible environment banner and page titles. */
export const environmentLabel = (kind: DeploymentKind) => (kind === "staging" ? "STAGING" : kind === "local" ? "LOCAL" : null);

/** Page-title prefix so browser tabs, bookmarks and link previews also say staging. */
export const titlePrefix = (env: Env = process.env) => (deploymentKind(env) === "staging" ? "[STAGING] " : "");
