import { deploymentKind } from "@/server/deployment/environment";

/**
 * robots.txt. Staging: disallow everything (staging safety rule 10, together with the noindex meta
 * and the X-Robots-Tag header). Production: unchanged pre-launch behaviour (no robots.txt; pages
 * carry noindex,nofollow until the owner's launch decision).
 */
export const dynamic = "force-dynamic";

export function GET() {
  if (deploymentKind() !== "staging") return new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  return new Response("User-agent: *\nDisallow: /\n", {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" },
  });
}
