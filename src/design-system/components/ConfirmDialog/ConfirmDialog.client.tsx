"use client";

import { useId, useRef, type ReactNode } from "react";
import { Button, type ButtonVariant } from "../Button";
import styles from "./confirm-dialog.module.css";

export interface ConfirmButtonProps {
  /** Visible trigger label, e.g. "Delete". */
  label: string;
  /** Dialog heading, e.g. "Delete this announcement?" */
  title: string;
  /** What happens, in words, including whether it can be undone. */
  message: ReactNode;
  /** Confirm button label, e.g. "Delete announcement". */
  confirmLabel: string;
  variant?: Exclude<ButtonVariant, "glass">;
  compact?: boolean;
  /** Name/value sent with the form when confirmed (e.g. action=delete). */
  name?: string;
  value?: string;
}

/**
 * Destructive-action confirmation. Must sit inside the <form> it submits. Uses the native modal
 * <dialog>: focus moves into it, Tab stays inside, Escape and Cancel close it and return focus
 * to the trigger. Without JavaScript the trigger stays a plain button and nothing is submitted.
 */
export function ConfirmButton({ label, title, message, confirmLabel, variant = "secondary", compact, name, value }: ConfirmButtonProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  return (
    <>
      <Button variant={variant} compact={compact} onClick={() => ref.current?.showModal()} aria-haspopup="dialog">
        {label}
      </Button>
      <dialog ref={ref} className={styles.dialog} aria-labelledby={`${id}-t`} aria-describedby={`${id}-m`}>
        <h2 id={`${id}-t`} className={styles.title}>{title}</h2>
        <div id={`${id}-m`} className={styles.message}>{message}</div>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={() => ref.current?.close()} autoFocus>
            Cancel
          </Button>
          <Button variant="primary" type="submit" name={name} value={value} onClick={() => ref.current?.close()}>
            {confirmLabel}
          </Button>
        </div>
      </dialog>
    </>
  );
}
