import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/cx";
import styles from "./gradient-surface.module.css";

/** The five approved static presets (Gate 1). Iravu was removed. */
export const gradientPresets = ["vaigarai", "manal", "kadal", "andhi", "thalir"] as const;
export type GradientPreset = (typeof gradientPresets)[number];

export interface GradientSurfaceProps extends HTMLAttributes<HTMLElement> {
  preset: GradientPreset;
  as?: ElementType;
  children?: ReactNode;
}

/**
 * Static gradient preset with the pre-rendered grain tile. All text inside must use
 * --color-text-on-gradient (ink-900), which this surface sets as its colour.
 * Not for the hero: the hero is the only animated gradient and is built in Phase 3.
 */
export function GradientSurface({ preset, as: Tag = "div", className, children, ...rest }: GradientSurfaceProps) {
  return (
    <Tag className={cx(styles.surface, styles[preset], className)} data-preset={preset} {...rest}>
      {children}
    </Tag>
  );
}
