import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { fontVariables } from "@/design-system/fonts/fonts";
import { isLocale, locales } from "@/lib/i18n";
import "@/design-system/tokens/tokens.css";
import "@/design-system/tokens/component-tokens.css";
import "@/design-system/styles/base.css";

export const dynamicParams = false;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  title: { default: "NLTAG", template: "%s · NLTAG" },
  // Pre-launch: nothing is indexed until Gate 7 authorises the public launch.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#FFFFFF", // token-audit-ignore: metadata API needs a literal; equals --paper-0
  colorScheme: "light",
};

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <html lang={locale} className={fontVariables}>
      <body>{children}</body>
    </html>
  );
}
