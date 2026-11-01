import type { Locale, UiStringKey } from "@/content/ui-strings";
import { t } from "@/content/ui-strings";
import { cx } from "@/lib/cx";
import styles from "./status-badge.module.css";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "error";

export type MembershipStatus =
  | "draft" | "emailVerified" | "pendingReview" | "correctionRequested" | "active" | "rejected";

/** Membership lifecycle → tone and label (Phase 1 §6; Gate 0 §5). */
export const membershipStatusMap: Record<MembershipStatus, { tone: BadgeTone; key: UiStringKey }> = {
  draft: { tone: "neutral", key: "status.draft" },
  emailVerified: { tone: "info", key: "status.emailVerified" },
  pendingReview: { tone: "info", key: "status.pendingReview" },
  correctionRequested: { tone: "warning", key: "status.correctionRequested" },
  active: { tone: "success", key: "status.active" },
  rejected: { tone: "error", key: "status.rejected" },
};

export interface StatusBadgeProps {
  tone: BadgeTone;
  children: string;
  className?: string;
}

/** Generic status pill: dot + word. The word carries the meaning; colour reinforces it. */
export function StatusBadge({ tone, children, className }: StatusBadgeProps) {
  return (
    <span className={cx(styles.badge, styles[tone], className)}>
      <span className={styles.dot} aria-hidden="true" />
      {children}
    </span>
  );
}

export function MembershipStatusBadge({ status, locale }: { status: MembershipStatus; locale: Locale }) {
  const { tone, key } = membershipStatusMap[status];
  return <StatusBadge tone={tone}>{t(key, locale)}</StatusBadge>;
}
