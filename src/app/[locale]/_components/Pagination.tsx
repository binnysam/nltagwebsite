import { ButtonLink } from "@/design-system/components";
import { t, type Locale } from "@/content/ui-strings";
import styles from "../public.module.css";

/**
 * Previous / next links with "Page n of m" between them. Plain links (works without JavaScript);
 * hidden when there is only one page. `hrefFor(page)` builds each address.
 */
export function Pagination({ locale, page, totalPages, hrefFor }: { locale: Locale; page: number; totalPages: number; hrefFor: (page: number) => string }) {
  if (totalPages <= 1) return null;
  const status = t("pagination.status", locale).replace("{page}", String(page)).replace("{total}", String(totalPages));
  return (
    <nav aria-label={t("pagination.label", locale)} className={styles.pagination} data-pagination="">
      {page > 1 ? <ButtonLink href={hrefFor(page - 1)} variant="secondary" rel="prev">{t("pagination.previous", locale)}</ButtonLink> : null}
      <span className={styles.paginationStatus}>{status}</span>
      {page < totalPages ? <ButtonLink href={hrefFor(page + 1)} variant="secondary" rel="next">{t("pagination.next", locale)}</ButtonLink> : null}
    </nav>
  );
}
