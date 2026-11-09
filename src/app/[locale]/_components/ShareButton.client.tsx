"use client";

import { useEffect, useState } from "react";
import { Button } from "@/design-system/components";

/**
 * Share this page: the device share sheet where the browser has one, otherwise copies the link and
 * says so in a polite live region. Rendered only once JavaScript runs, so there is never a dead
 * button without it. Shares the canonical page address only (no tracking parameters).
 */
export function ShareButton({ path, title, label, copiedLabel }: { path: string; title: string; label: string; copiedLabel: string }) {
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration flag: render only in the browser
  useEffect(() => setReady(true), []);
  if (!ready) return null;

  async function share() {
    const url = new URL(path, window.location.origin).toString();
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Share sheet dismissed or clipboard refused: nothing to report.
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={share} data-share="">{label}</Button>
      <span role="status" aria-live="polite" className={copied ? undefined : "ds-visually-hidden"}>{copied ? copiedLabel : ""}</span>
    </>
  );
}
