import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import type { GradientPreset } from "../GradientSurface";
import { HeroShell } from "./Hero.client";
import styles from "./hero.module.css";

/**
 * Order the five approved presets appear in. Neighbours share a hue family so each crossfade
 * is gentle: first light → dusk → the Gulf → new shoot → sand → back to first light.
 * Vaigarai first: it is the default preset and the still frame.
 */
export const heroPresetOrder = ["vaigarai", "andhi", "kadal", "thalir", "manal"] as const satisfies readonly GradientPreset[];

export interface HeroProps {
  /** id of the hero's heading, for aria-labelledby. */
  headingId: string;
  /** Accessible names for the motion control, in the page language. */
  pauseLabel: string;
  playLabel: string;
  className?: string;
  children: ReactNode;
}

/**
 * Homepage hero: the only animated gradient on the site (Phase 1 §8).
 * Content is server-rendered and fully visible without JavaScript; all text uses
 * --color-text-on-gradient (ink-900). Use once per page, on the homepage only.
 */
export function Hero({ headingId, pauseLabel, playLabel, className, children }: HeroProps) {
  return (
    <HeroShell
      className={cx(styles.hero, className)}
      toggleClassName={styles.toggle}
      labelledBy={headingId}
      pauseLabel={pauseLabel}
      playLabel={playLabel}
    >
      <div className={styles.backdrop} aria-hidden="true" data-hero-backdrop="">
        <div className={styles.layer}>
          {heroPresetOrder.map((p) => (
            <span key={p} className={cx(styles.preset, styles[p])} data-hero-preset={p} />
          ))}
        </div>
        <div className={styles.layer}>
          <div className={styles.fields}>
            <span className={cx(styles.field, styles.field1)} data-hero-field="" />
            <span className={cx(styles.field, styles.field2)} data-hero-field="" />
            <span className={cx(styles.field, styles.field3)} data-hero-field="" />
            <span className={cx(styles.field, styles.field4)} data-hero-field="" />
          </div>
        </div>
        <span className={styles.grain} />
      </div>
      <div className={styles.content}>{children}</div>
    </HeroShell>
  );
}
