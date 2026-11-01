import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/cx";
import styles from "./layout.module.css";

export type Space = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
const gapClass: Record<Space, string | undefined> = {
  1: styles.gap1, 2: styles.gap2, 3: styles.gap3, 4: styles.gap4,
  5: styles.gap5, 6: styles.gap6, 7: styles.gap7, 8: styles.gap8,
};

type Base = HTMLAttributes<HTMLElement> & { children?: ReactNode; as?: ElementType };

/** Centred content column: 1200px (or 1360px `wide`) plus the fluid 16→32px gutter. */
export function Container({ wide, as: Tag = "div", className, ...rest }: Base & { wide?: boolean }) {
  return <Tag className={cx(styles.container, wide && styles.wide, className)} {...rest} />;
}

/** Vertical section rhythm: 64px phone, 96px from 1024px. */
export function Section({ as: Tag = "section", className, ...rest }: Base) {
  return <Tag className={cx(styles.section, className)} {...rest} />;
}

export function Stack({ gap = 4, as: Tag = "div", className, ...rest }: Base & { gap?: Space }) {
  return <Tag className={cx(styles.stack, gapClass[gap], className)} {...rest} />;
}

export function Cluster({ gap = 3, as: Tag = "div", className, ...rest }: Base & { gap?: Space }) {
  return <Tag className={cx(styles.cluster, gapClass[gap], className)} {...rest} />;
}

/** 12-column grid, 16px gap (24px from 1024px). Children set their own `grid-column`. */
export function Grid({ as: Tag = "div", className, ...rest }: Base) {
  return <Tag className={cx(styles.grid, className)} {...rest} />;
}

export function Divider({ className, ...rest }: HTMLAttributes<HTMLHRElement>) {
  return <hr className={cx(styles.divider, className)} {...rest} />;
}

/** Card surface. `subtle` uses paper-100 without elevation. */
export function Surface({
  subtle, padding = 5, as: Tag = "div", className, ...rest
}: Base & { subtle?: boolean; padding?: 4 | 5 | 6 }) {
  const pad = { 4: styles.pad4, 5: styles.pad5, 6: styles.pad6 }[padding];
  return <Tag className={cx(subtle ? styles.surfaceSubtle : styles.surface, pad, className)} {...rest} />;
}

/** Static loading indicator (a still ring, no rotation). Always pair with a visible text label; it is hidden from assistive tech. */
export function Spinner({ className }: { className?: string }) {
  return <span className={cx(styles.spinner, className)} aria-hidden="true" />;
}

/** Static loading placeholder. Mark the loading region with aria-busy on its container. */
export function Skeleton({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cx(styles.skeleton, className)} aria-hidden="true" {...rest} />;
}
