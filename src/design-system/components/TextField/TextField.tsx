import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cx } from "@/lib/cx";
import styles from "./text-field.module.css";

interface FieldProps {
  /** Stable id; also derives the hint and error ids. */
  id: string;
  label: string;
  hint?: string;
  /** Error message in words. Setting it marks the field invalid. */
  error?: string;
  /** Word shown after the label for required/optional, e.g. "Required" / "அவசியம்". */
  requirementText?: string;
  className?: string;
}

export type TextFieldProps = FieldProps & Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & { multiline?: false };
export type TextAreaFieldProps = FieldProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> & { multiline: true };

/**
 * Labelled text input or textarea. Label is always visible above the control; hint and
 * error are linked with aria-describedby; errors are announced via aria-invalid and text,
 * never colour alone.
 */
export function TextField(props: TextFieldProps | TextAreaFieldProps) {
  const { id, label, hint, error, requirementText, className, multiline, ...control } = props;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const shared = {
    id,
    className: styles.control,
    "aria-invalid": error ? (true as const) : undefined,
    "aria-describedby": describedBy,
  };
  return (
    <div className={cx(styles.field, className)}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {requirementText ? <span className={styles.requirement}> ({requirementText})</span> : null}
      </label>
      {hint ? <p id={hintId} className={styles.hint}>{hint}</p> : null}
      {multiline ? (
        <textarea {...(control as TextareaHTMLAttributes<HTMLTextAreaElement>)} {...shared} />
      ) : (
        <input type="text" {...(control as InputHTMLAttributes<HTMLInputElement>)} {...shared} />
      )}
      {error ? (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
