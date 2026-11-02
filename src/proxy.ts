import { NextResponse, type NextRequest } from "next/server";
import { clientIpConfig, noteHeaderShape, withTrustedClientIp } from "@/server/security/client-ip";

/**
 * Request proxy (Next.js 16 "proxy", formerly middleware). Runs before every page, server action
 * and API route except static files. Two jobs, both from src/server/security/client-ip.ts:
 *
 * 1. Replace the internal client-IP header (x-nltag-client-ip) with the address resolved from the
 *    CDN's forwarding headers, or remove it when that cannot be trusted. Nothing downstream ever
 *    sees a client-supplied value for it. The auth route repeats this as defence in depth.
 * 2. Header-shape capture: logs each distinct forwarding-header layout once (counts, address
 *    classes, positions — never an address). Used to confirm CLIENT_IP_PROXY_HOPS on Hostinger.
 *
 * Never redirects, never blocks, never sets cookies.
 */
export function proxy(req: NextRequest) {
  const ipConfig = clientIpConfig();
  noteHeaderShape(req.headers, ipConfig);
  return NextResponse.next({ request: { headers: withTrustedClientIp(req.headers, ipConfig) } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|woff2?|ttf|css|js|map|txt|xml)$).*)"],
};
