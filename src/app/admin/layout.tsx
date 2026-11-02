import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { fontVariables } from "@/design-system/fonts/fonts";
import "@/design-system/tokens/tokens.css";
import "@/design-system/tokens/component-tokens.css";
import "@/design-system/styles/base.css";

/**
 * Admin root layout (English-first, Phase 4c). Its own <html lang="en">: the public site's
 * locale layout is not involved. Never indexed or cached (headers also set in next.config.ts).
 * Access checks run in every page and server action (src/app/admin/_lib/staff.ts).
 */
export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · NLTAG Admin" },
  robots: { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = {
  themeColor: "#FFFFFF", // token-audit-ignore: metadata API needs a literal; equals --paper-0
  colorScheme: "light",
};

export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={fontVariables}>
      <body>{children}</body>
    </html>
  );
}
