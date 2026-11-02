"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "../admin.module.css";

export interface NavItem {
  href: string;
  label: string;
}

const isCurrent = (pathname: string, href: string) => (href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`));

/**
 * Sidebar on desktop; a "Menu" disclosure on phones (native <details>: keyboard and screen-reader
 * support without scripts). Only one of the two is displayed at a time.
 */
export function AdminNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const list = (
    <ul className={styles.navList}>
      {items.map((i) => (
        <li key={i.href}>
          <Link href={i.href} className={styles.navLink} aria-current={isCurrent(pathname, i.href) ? "page" : undefined}>
            {i.label}
          </Link>
        </li>
      ))}
    </ul>
  );
  return (
    <>
      <details className={styles.navMobile}>
        <summary className={styles.navSummary}>Menu</summary>
        <nav aria-label="Admin sections (menu)">{list}</nav>
      </details>
      <nav aria-label="Admin sections" className={styles.navDesktop}>
        {list}
      </nav>
    </>
  );
}
