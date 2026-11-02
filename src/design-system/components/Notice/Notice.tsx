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
}

/** Inline message for form results and page-level states. Static: no motion, no dismiss timer. */
export function Notice({ tone, title, children, className }: NoticeProps) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx(styles.notice, styles[tone], className)}>
      <p className={styles.title}>{title}</p>
      {children ? <div className={styles.body}>{children}</div> : null}
    </div>
  );
}
