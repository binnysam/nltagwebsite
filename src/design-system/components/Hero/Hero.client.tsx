"use client";

import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { IconButton } from "../Button";
import { Icon } from "@/design-system/primitives";

/** sessionStorage key: a viewer who paused the hero keeps it paused for the rest of the visit. */
const PAUSE_KEY = "nltag-hero-paused";

const listeners = new Set<() => void>();
const pauseStore = {
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  get(): boolean {
    try {
      return window.sessionStorage.getItem(PAUSE_KEY) === "1";
    } catch {
      return memoryPaused; // storage blocked: remember for this page only
    }
  },
  set(value: boolean) {
    memoryPaused = value;
    try {
      window.sessionStorage.setItem(PAUSE_KEY, value ? "1" : "0");
    } catch {
      /* storage blocked */
    }
    listeners.forEach((l) => l());
  },
};
let memoryPaused = false;
const noopSubscribe = () => () => {};

export interface HeroShellProps {
  className?: string;
  toggleClassName?: string;
  labelledBy?: string;
  pauseLabel: string;
  playLabel: string;
  children: ReactNode;
}

/**
 * Owns the hero's motion state:
 *  - data-ready   "true" after hydration. Until then, and without JavaScript, the hero is still,
 *                 so motion never starts without a working pause control (WCAG 2.2.2).
 *  - data-motion  "running" | "paused", set by the visible control and remembered for the visit.
 *  - data-visible "false" while the hero is scrolled out of view, so nothing animates off screen.
 * Reduced motion is handled entirely in CSS (still frame, control hidden).
 */
export function HeroShell({ className, toggleClassName, labelledBy, pauseLabel, playLabel, children }: HeroShellProps) {
  const ref = useRef<HTMLElement>(null);
  const ready = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const paused = useSyncExternalStore(pauseStore.subscribe, pauseStore.get, () => false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry?.isIntersecting ?? true));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      className={className}
      aria-labelledby={labelledBy}
      data-hero=""
      data-ready={ready ? "true" : "false"}
      data-motion={paused ? "paused" : "running"}
      data-visible={visible ? "true" : "false"}
    >
      {children}
      {ready ? (
        <IconButton
          variant="glass"
          className={toggleClassName}
          label={paused ? playLabel : pauseLabel}
          icon={<Icon name={paused ? "play" : "pause"} size="small" />}
          onClick={() => pauseStore.set(!paused)}
          data-hero-toggle=""
        />
      ) : null}
    </section>
  );
}
