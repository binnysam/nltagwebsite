"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Locale } from "@/content/ui-strings";
import { t } from "@/content/ui-strings";
import { switchLocalePath } from "@/lib/i18n";
import styles from "./language-switch.module.css";

export interface LanguageSwitchProps {
  locale: Locale;
  /** Overrides the current path (tests, gallery). */
  pathname?: string;
}

/**
 * Switches between Tamil and English while keeping the equivalent page.
 * Implemented as two links (it navigates), the current one marked aria-current="true".
 * Each link carries its own lang and hreflang so it is announced in its language.
 */
export function LanguageSwitch({ locale, pathname: pathOverride }: LanguageSwitchProps) {
  const current = usePathname() ?? `/${locale}`;
  const pathname = pathOverride ?? current;
  // Visible text is the accessible name (WCAG 2.5.3); lang makes "EN" read in English.
  const options: Array<{ code: Locale; short: string }> = [
    { code: "ta", short: "தமிழ்" },
    { code: "en", short: "EN" },
  ];
  return (
    <nav aria-label={t("lang.label", locale)} className={styles.switch}>
      {options.map((o) => {
        const active = o.code === locale;
        return (
          <Link
            key={o.code}
            href={switchLocalePath(pathname, o.code)}
            hrefLang={o.code}
            lang={o.code}
            aria-current={active ? "true" : undefined}
            className={styles.segment}
            prefetch={false}
          >
            {o.short}
          </Link>
        );
      })}
    </nav>
  );
}
