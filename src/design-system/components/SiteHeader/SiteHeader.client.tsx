"use client";

import { type ReactNode, createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { IconButton } from "../Button";
import { Icon } from "@/design-system/primitives";

interface MenuState {
  open: boolean;
  panelId: string;
  toggle: () => void;
  close: (returnFocus: boolean) => void;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
}
const MenuContext = createContext<MenuState | null>(null);

function useMenu(): MenuState {
  const ctx = useContext(MenuContext);
  if (!ctx) throw new Error("Menu parts must be rendered inside HeaderShell");
  return ctx;
}

/**
 * Sticky header wrapper. Sets data-stuck once the page has scrolled (shadow-1) and owns the
 * mobile menu state shared by MenuButton and MenuPanel.
 */
export function HeaderShell({ className, children }: { className?: string; children: ReactNode }) {
  const [stuck, setStuck] = useState(false);
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const update = () => setStuck(window.scrollY > 0);
    window.addEventListener("scroll", update, { passive: true });
    update();
    return () => window.removeEventListener("scroll", update);
  }, []);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  const value = useMemo(() => ({ open, panelId, toggle: () => setOpen((v) => !v), close, buttonRef }), [open, panelId, close]);

  return (
    <MenuContext.Provider value={value}>
      <header className={className} data-stuck={stuck ? "true" : "false"} id="site-header">
        {children}
      </header>
    </MenuContext.Provider>
  );
}

/** 44×44 menu toggle (< 1280px). aria-expanded and aria-controls describe the disclosure. */
export function MenuButton({ openLabel, closeLabel, className }: { openLabel: string; closeLabel: string; className?: string }) {
  const { open, panelId, toggle, buttonRef } = useMenu();
  return (
    <IconButton
      ref={buttonRef}
      className={className}
      label={open ? closeLabel : openLabel}
      aria-expanded={open}
      aria-controls={panelId}
      icon={<Icon name={open ? "close" : "menu"} />}
      onClick={toggle}
    />
  );
}

/**
 * Disclosure panel spanning the header width. Not modal, so focus is not trapped.
 * Escape closes it and returns focus to the button; following a link closes it.
 */
export function MenuPanel({ navLabel, className, children }: { navLabel: string; className?: string; children: ReactNode }) {
  const { open, panelId, close } = useMenu();
  return (
    <nav
      id={panelId}
      aria-label={navLabel}
      className={className}
      hidden={!open}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a")) close(false);
      }}
    >
      {children}
    </nav>
  );
}
