import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Media uploads are limited to 2 MB in the service; allow the multipart overhead (Phase 4c).
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
  // Hostinger Business runs `next start` on Node.js; no static export (CMS/auth come later).
  async redirects() {
    // Tamil is the default locale (Gate 0). Temporary redirect so the default can change later.
    return [{ source: "/", destination: "/ta", permanent: false }];
  },
  async headers() {
    // Account pages and the auth API are per-user: never cached, never indexed (architecture §4).
    const privateHeaders = [
      { key: "Cache-Control", value: "private, no-store" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
    ];
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/:locale(ta|en)/:page(sign-in|sign-up|forgot-password|reset-password|verify-email|account)", headers: privateHeaders },
      { source: "/:locale(ta|en)/account/:rest*", headers: privateHeaders },
      { source: "/api/auth/:rest*", headers: privateHeaders },
      // CMS admin and previews (Phase 4c): per-user, never cached or indexed.
      { source: "/admin", headers: privateHeaders },
      { source: "/admin/:rest*", headers: privateHeaders },
    ];
  },
};

export default config;
