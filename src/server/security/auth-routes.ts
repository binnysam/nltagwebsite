/**
 * R4 v6: the complete list of Better Auth endpoints reachable over HTTP. Default deny: a request
 * whose method and exact path are not in AUTH_ROUTES gets the gate's own 404 and never reaches
 * Better Auth. Every endpoint Better Auth registers must appear in exactly one of AUTH_ROUTES or
 * DENIED_ENDPOINTS; tests/integration/r4-route-contract.test.ts fails otherwise, so a Better Auth
 * upgrade that adds an endpoint cannot pass CI until someone classifies it.
 */

export type Policy = "signIn" | "resetRequest" | "token" | "secondFactor" | "session";

export interface AuthRoute {
  method: "GET" | "POST";
  /** Better Auth path, with :param segments (matched as one segment of [A-Za-z0-9]{1,64}). */
  path: string;
  policy: Policy;
  /**
   * What the request must already carry. "two-factor challenge cookie" is enforced by the gate
   * itself (v6.1 G1: no challenge cookie → the gate's 404, and session cookies are stripped so
   * Better Auth can only take its challenge path); the others are enforced by Better Auth.
   */
  requires: "nothing" | "reset token" | "two-factor challenge cookie" | "session";
  /** Query string allowed (only where Better Auth needs one). */
  query?: boolean;
  purpose: string;
}

export const AUTH_ROUTES: readonly AuthRoute[] = [
  { method: "POST", path: "/sign-in/email", policy: "signIn", requires: "nothing", purpose: "Password sign-in (sign-in page)" },
  { method: "POST", path: "/request-password-reset", policy: "resetRequest", requires: "nothing", purpose: "Forgot-password request (existing accounts)" },
  { method: "GET", path: "/reset-password/:token", policy: "token", requires: "reset token", query: true, purpose: "Emailed set-password / reset link; redirects to the page" },
  { method: "POST", path: "/reset-password", policy: "token", requires: "reset token", purpose: "Choose a password (first password or reset)" },
  { method: "POST", path: "/two-factor/verify-totp", policy: "secondFactor", requires: "two-factor challenge cookie", purpose: "Sign-in challenge: authenticator code" },
  { method: "POST", path: "/two-factor/verify-backup-code", policy: "secondFactor", requires: "two-factor challenge cookie", purpose: "Sign-in challenge: recovery code" },
  { method: "POST", path: "/sign-out", policy: "session", requires: "session", purpose: "Sign out (account page)" },
  { method: "POST", path: "/revoke-other-sessions", policy: "session", requires: "session", purpose: "Sign out other devices (account page)" },
  { method: "GET", path: "/get-session", policy: "session", requires: "session", query: true, purpose: "Better Auth client session refresh" },
];

/** Every other endpoint Better Auth 1.7.15 registers under this configuration, and why it is closed. */
export const DENIED_ENDPOINTS: Readonly<Record<string, string>> = {
  "/sign-up/email": "Mailbox-first: accounts come from /api/account-request (D1)",
  "/send-verification-email": "Mailbox-first: the set-password link proves the mailbox; verification JWTs cannot be voided",
  "/verify-email": "As above; not used by any page",
  "/sign-in/social": "Google sign-in stays unconfigured (owner decision 2 Nov 2026)",
  "/callback/:id": "OAuth callback; Google unconfigured",
  "/link-social": "OAuth; Google unconfigured",
  "/unlink-account": "OAuth; Google unconfigured",
  "/get-access-token": "OAuth tokens; Google unconfigured",
  "/refresh-token": "OAuth tokens; Google unconfigured",
  "/account-info": "OAuth account info; not used",
  "/list-accounts": "Not used by any page",
  "/change-password": "Not used; would allow unlimited password guessing with a session",
  "/verify-password": "Not used; would allow unlimited password guessing with a session",
  "/change-email": "Not used; email changes are not offered",
  "/update-user": "Not used; profile editing is not offered",
  "/delete-user": "Not used; account deletion is an owner procedure",
  "/delete-user/callback": "Not used",
  "/update-session": "Not used",
  "/list-sessions": "The account page lists sessions server-side (getAuth().api)",
  "/revoke-session": "Not used by any page",
  "/revoke-sessions": "Not used by any page",
  "/error": "Better Auth error page; the site has its own",
  "/ok": "Health check; not needed publicly",
  "/two-factor/enable": "Server action only (getAuth().api), D6",
  "/two-factor/disable": "Server action only (getAuth().api), D6",
  "/two-factor/generate-backup-codes": "Server action only (getAuth().api), D6",
  "/two-factor/get-totp-uri": "Never shown again after enrollment",
  "/two-factor/send-otp": "Email OTP not offered (authenticator apps only)",
  "/two-factor/verify-otp": "Email OTP not offered (authenticator apps only)",
};

interface Compiled {
  route: AuthRoute;
  re: RegExp;
}

const compiled: Compiled[] = AUTH_ROUTES.map((route) => ({
  route,
  re: new RegExp(`^${route.path.replace(/:[a-zA-Z]+/g, "[A-Za-z0-9]{1,64}").replace(/\//g, "\\/")}$`),
}));

export const AUTH_BASE = "/api/auth";

/**
 * The route for this exact request, or null. No normalisation of any kind: a trailing slash,
 * different case, doubled slash, percent-encoding or unlisted method is simply not a match.
 */
export function matchAuthRoute(method: string, url: URL): AuthRoute | null {
  const raw = url.pathname;
  if (!raw.startsWith(`${AUTH_BASE}/`)) return null;
  const path = raw.slice(AUTH_BASE.length);
  for (const { route, re } of compiled) {
    if (route.method !== method) continue;
    if (!re.test(path)) continue;
    if (url.search !== "" && !route.query) return null;
    return route;
  }
  return null;
}
