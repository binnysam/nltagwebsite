import Link from "next/link";
import styles from "../admin.module.css";

/** Previous/next links for inbox lists (25 per page). Plain links: work without JavaScript. */
export function InboxPager({ base, page, total, pageSize, query = {} }: { base: string; page: number; total: number; pageSize: number; query?: Record<string, string> }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (p: number) => `${base}?${new URLSearchParams({ ...Object.fromEntries(Object.entries(query).filter(([, v]) => v)), page: String(p) })}`;
  return (
    <nav aria-label="Pages" className={styles.filters}>
      {page > 1 ? <Link href={href(page - 1)} className={styles.topLink}>Previous page</Link> : <span />}
      <span className={styles.meta}>Page {page} of {pages}</span>
      {page < pages ? <Link href={href(page + 1)} className={styles.topLink}>Next page</Link> : <span />}
    </nav>
  );
}
