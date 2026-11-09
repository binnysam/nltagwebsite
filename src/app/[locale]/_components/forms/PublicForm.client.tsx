"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button, CheckboxField, Notice, SelectField, TextField } from "@/design-system/components";
import { initialFormState, type PublicFormState } from "./form-state";
import styles from "./public-form.module.css";

/**
 * One public form (prayer request, contact, testimony) built only from design-system fields.
 * Works without JavaScript (plain POST to the server action) and with it (no page reload; typed
 * text kept on errors; focus moves to the result message). Server-side validation is the only
 * one that counts; the browser's `required` and `maxLength` are conveniences.
 * Every visible string arrives already in the page language (`labels`, `errorText`).
 */
export type FieldSpec =
  | { kind: "text" | "email" | "tel"; name: string; label: string; hint?: string; required?: boolean; maxLength: number; autoComplete?: string; lang?: string }
  | { kind: "textarea"; name: string; label: string; hint?: string; required?: boolean; maxLength: number; rows?: number }
  | { kind: "checkbox"; name: string; label: string; hint?: string; required?: boolean }
  | { kind: "select"; name: string; label: string; hint?: string; options: { value: string; label: string }[]; defaultValue: string };

export interface FormLabels {
  submit: string;
  received: string;
  receivedTitle: string;
  errorSummary: string;
  busy: string;
  expired: string;
  unavailable: string;
  failed: string;
  notSentTitle: string;
  required: string;
  optional: string;
  honeypot: string;
  pending: string;
}

export function PublicForm({
  id, locale, action, initialToken, fields, labels, errorText, intro,
}: {
  id: string;
  locale: "ta" | "en";
  action: (prev: PublicFormState, f: FormData) => Promise<PublicFormState>;
  initialToken: string;
  fields: FieldSpec[];
  labels: FormLabels;
  errorText: Record<string, string>;
  intro?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialFormState(initialToken));
  const resultRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.seq > 0) resultRef.current?.focus();
  }, [state.seq]);

  const fieldError = (name: string) => (state.errors[name] ? errorText[state.errors[name]!] ?? errorText["form.errorRequired"] : undefined);
  const value = (name: string) => state.values[name];
  const problem =
    state.status === "invalid" ? labels.errorSummary
    : state.status === "busy" ? labels.busy
    : state.status === "expired" ? labels.expired
    : state.status === "unavailable" ? labels.unavailable
    : state.status === "failed" ? labels.failed
    : null;

  return (
    <div className={styles.wrap}>
      <div ref={resultRef} tabIndex={-1} className={styles.result}>
        {state.status === "received" ? <Notice tone="success" title={labels.receivedTitle}><p>{labels.received}</p></Notice> : null}
        {problem ? <Notice tone="error" title={labels.notSentTitle}><p>{problem}</p></Notice> : null}
      </div>
      {intro ? <p className={styles.intro}>{intro}</p> : null}
      {/* key: a fresh, empty form after a successful send */}
      <form key={state.status === "received" ? `sent-${state.seq}` : "form"} id={id} action={formAction} className={styles.form} noValidate={false}>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="formToken" value={state.token} />
        {/* Honeypot: visually hidden and out of the accessibility tree (aria-hidden); never focusable. */}
        <div className="ds-visually-hidden" aria-hidden="true">
          <label htmlFor={`${id}-website`}>{labels.honeypot}</label>
          <input id={`${id}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
        </div>
        {fields.map((f) => {
          const fid = `${id}-${f.name}`;
          if (f.kind === "checkbox") {
            return <CheckboxField key={f.name} id={fid} name={f.name} label={f.label} hint={f.hint} required={f.required} error={fieldError(f.name)} />;
          }
          if (f.kind === "select") {
            return <SelectField key={f.name} id={fid} name={f.name} label={f.label} hint={f.hint} options={f.options} defaultValue={value(f.name) ?? f.defaultValue} error={fieldError(f.name)} />;
          }
          const common = {
            id: fid, name: f.name, label: f.label, hint: f.hint, error: fieldError(f.name), required: f.required,
            requirementText: f.required ? labels.required : labels.optional, maxLength: f.maxLength, defaultValue: value(f.name) ?? "",
          };
          if (f.kind === "textarea") return <TextField key={f.name} {...common} multiline rows={f.rows ?? 6} />;
          return <TextField key={f.name} {...common} type={f.kind} autoComplete={f.autoComplete} lang={f.lang} />;
        })}
        <div className={styles.actions}>
          <Button type="submit" loading={pending} loadingLabel={labels.pending}>{labels.submit}</Button>
        </div>
      </form>
    </div>
  );
}
