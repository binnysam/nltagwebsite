"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Picks the server-rendered tree for the language in the URL. Used where Next.js passes no params
 * (not-found.tsx). Runs during server rendering too, so the HTML is already in the right language
 * and works without JavaScript. Tamil is the default (Gate 0).
 */
export function LocaleChoice({ ta, en }: { ta: ReactNode; en: ReactNode }) {
  const segment = usePathname()?.split("/")[1];
  return <>{segment === "en" ? en : ta}</>;
}
