// Canonical-origin check shared by the staging browser suite and its unit tests.
//
// A staging page's canonical URL must be on the staging origin under test (BASE) and must never be
// the live site. Comparing whole origins (scheme + host + port) keeps the legitimate staging host
// (https://staging.nltagkuwait.com, which contains "nltagkuwait.com") apart from production
// (https://nltagkuwait.com, also www) and from any other origin.

/** Origins that are production and must never appear as a staging canonical. */
export const PRODUCTION_ORIGINS = ["https://nltagkuwait.com", "https://www.nltagkuwait.com"] as const;

/** Returns a problem description, or null when `href` is a canonical URL on `base` for `path`. */
export function canonicalProblem(href: string | null | undefined, base: string, path: string): string | null {
  if (!href) return "no canonical URL";
  let url: URL;
  let expected: URL;
  try {
    url = new URL(href);
    expected = new URL(base);
  } catch {
    return `not an absolute URL: ${href}`;
  }
  if ((PRODUCTION_ORIGINS as readonly string[]).includes(url.origin)) return `canonical points at production (${url.origin})`;
  if (url.origin !== expected.origin) return `canonical origin ${url.origin} is not the site under test (${expected.origin})`;
  if (url.pathname !== path && !url.pathname.startsWith(`${path}/`)) return `canonical path ${url.pathname} does not match ${path}`;
  return null;
}
