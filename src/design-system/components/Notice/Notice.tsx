import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import styles from "./notice.module.css";

export type NoticeTone = "info" | "success" | "warning" | "error";

export interface NoticeProps {
  tone: NoticeTone;
  /** Short heading in words ("Saved", "Could not save"). The words carry the meaning, never colour alone. */
  title: string;
  children?: ReactNode;
  /** Errors interrupt (role="alert"); everything else is polite (role="status"). */
  className?: string;
  /**
   * false: a persistent, non-live notice (e.g. the staging environment banner) with no status/alert
   * role, so it is not announced as a message and never collides with the page's own results.
   */
  live?: boolean;
}

/** Inline message for form results and page-level states. Static: no motion, no dismiss timer. */
export function Notice({ tone, title, children, className, live = true }: NoticeProps) {
  return (
    <div role={live ? (tone === "error" ? "alert" : "status") : undefined} className={cx(styles.notice, styles[tone], className)}>
      <p className={styles.title}>{title}</p>
      {children ? <div className={styles.body}>{children}</div> : null}
    </div>
  );
}
