import { t, type Locale, type UiStringKey } from "@/content/ui-strings";
import type { FormLabels } from "./PublicForm.client";

/** Labels and error texts for the public forms, in the page language (server side). */
export function formLabels(locale: Locale, submit: UiStringKey, received: UiStringKey): FormLabels {
  return {
    submit: t(submit, locale),
    received: t(received, locale),
    receivedTitle: t(received, locale).split(/[.!]/)[0] ?? t(received, locale),
    errorSummary: t("form.error.summary", locale),
    busy: t("form.busy", locale),
    expired: t("form.expired", locale),
    unavailable: t("form.unavailable", locale),
    failed: t("form.failed", locale),
    notSentTitle: t("form.failed", locale).split(/[.!]/)[0] ?? t("form.failed", locale),
    required: t("form.required", locale),
    optional: t("form.optional", locale),
    honeypot: t("form.honeypot", locale),
    pending: t("form.loading", locale),
  };
}

const ERROR_KEYS = [
  "form.errorRequired", "form.error.tooLong", "form.error.tooShort", "form.error.email", "form.error.contact", "form.error.phone",
  "form.error.links", "form.error.html", "form.error.consent",
] as const satisfies readonly UiStringKey[];

export function formErrorText(locale: Locale): Record<string, string> {
  return Object.fromEntries(ERROR_KEYS.map((k) => [k, t(k, locale)]));
}
