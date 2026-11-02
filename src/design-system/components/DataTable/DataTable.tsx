import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import styles from "./data-table.module.css";

export interface DataTableProps {
  /** Table caption (accessible name). Visually hidden when `captionHidden`. */
  caption: string;
  captionHidden?: boolean;
  /** <thead> and <tbody> content. Use <th scope="col"> for headers and <th scope="row"> for the first cell. */
  children: ReactNode;
  className?: string;
}

/**
 * Plain data table on a card surface. On narrow screens the table scrolls inside its own
 * focusable region (keyboard-scrollable, named by the caption) so the page never scrolls sideways.
 */
export function DataTable({ caption, captionHidden, children, className }: DataTableProps) {
  return (
    <div className={cx(styles.wrap, className)} role="region" aria-label={caption} tabIndex={0}>
      <table className={styles.table}>
        <caption className={captionHidden ? "ds-visually-hidden" : styles.caption}>{caption}</caption>
        {children}
      </table>
    </div>
  );
}
