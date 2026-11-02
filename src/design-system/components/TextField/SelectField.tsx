import type { SelectHTMLAttributes } from "react";
import { cx } from "@/lib/cx";
import styles from "./text-field.module.css";

export interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  options: readonly { value: string; label: string }[];
  className?: string;
}

/** Native select with the TextField anatomy (visible label, hint, error in words). */
export function SelectField({ id, label, hint, error, options, className, ...rest }: SelectFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={cx(styles.field, className)}>
      <label htmlFor={id} className={styles.label}>{label}</label>
      {hint ? <p id={hintId} className={styles.hint}>{hint}</p> : null}
      <select
        id={id}
        className={cx(styles.control, styles.select)}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {error ? <p id={errorId} className={styles.error}>{error}</p> : null}
    </div>
  );
}

export interface CheckboxFieldProps {
  id: string;
  name: string;
  label: string;
  hint?: string;
  defaultChecked?: boolean;
  disabled?: boolean;
  className?: string;
}

/** Checkbox with its label as a 44px target. Edge uses border-control (≥3:1). */
export function CheckboxField({ id, name, label, hint, defaultChecked, disabled, className }: CheckboxFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className={cx(styles.checkField, className)}>
      <label htmlFor={id} className={styles.checkLabel}>
        <input id={id} name={name} type="checkbox" className={styles.checkbox} defaultChecked={defaultChecked} disabled={disabled} aria-describedby={hintId} />
        <span>{label}</span>
      </label>
      {hint ? <p id={hintId} className={styles.hint}>{hint}</p> : null}
    </div>
  );
}
