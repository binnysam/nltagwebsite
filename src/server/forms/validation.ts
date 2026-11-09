// Server-side validation of the public forms. Pure (no I/O): unit-tested directly.
// Errors are keys of ui-strings ("form.error.*"), so the page shows them in the visitor's language.
import { MAX_LINKS, countLinks } from "./protection-pure";

export type FieldErrors = Record<string, FormErrorKey>;
export type FormErrorKey =
  | "form.errorRequired"
  | "form.error.tooLong"
  | "form.error.tooShort"
  | "form.error.email"
  | "form.error.contact"
  | "form.error.phone"
  | "form.error.links"
  | "form.error.html"
  | "form.error.consent";

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const HTML_TAG = /<\/?[a-z!][^>]*>/i;
const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;
const PHONE = /^\+?[0-9 ()-]{6,20}$/;

/** NFC, trimmed, LF line endings, control characters removed. */
export function clean(value: FormDataEntryValue | null, multiline = false): string {
  if (typeof value !== "string") return "";
  let v = value.normalize("NFC").replace(/\r\n?/g, "\n").replace(CONTROL, "");
  if (!multiline) v = v.replace(/\s+/g, " ");
  return v.trim();
}

function text(errors: FieldErrors, field: string, v: string, opts: { required?: boolean; min?: number; max: number; links?: boolean }) {
  if (!v) {
    if (opts.required) errors[field] = "form.errorRequired";
    return;
  }
  if (v.length > opts.max) errors[field] = "form.error.tooLong";
  else if (opts.min && v.length < opts.min) errors[field] = "form.error.tooShort";
  else if (HTML_TAG.test(v)) errors[field] = "form.error.html";
  else if (opts.links && countLinks(v) > MAX_LINKS) errors[field] = "form.error.links";
}

const checked = (v: FormDataEntryValue | null) => v === "on" || v === "1" || v === "true";

export interface PrayerInput { name: string; contact: string; contactRequested: boolean; body: string }
export interface ContactInput { name: string; email: string; phone: string; subject: string; message: string }
export interface TestimonyInput { title: string; body: string; display: "FULL_NAME" | "FIRST_NAME" | "ANONYMOUS"; name: string; contact: string }

export type Parsed<T> = { ok: true; data: T } | { ok: false; errors: FieldErrors };

export function parsePrayer(f: FormData): Parsed<PrayerInput> {
  const errors: FieldErrors = {};
  const d: PrayerInput = { name: clean(f.get("name")), contact: clean(f.get("contact")), contactRequested: checked(f.get("contactRequested")), body: clean(f.get("body"), true) };
  text(errors, "name", d.name, { max: 120 });
  text(errors, "contact", d.contact, { max: 254 });
  if (d.contact && !EMAIL.test(d.contact) && !PHONE.test(d.contact)) errors.contact = "form.error.contact";
  if (d.contactRequested && !d.contact) errors.contact = "form.errorRequired";
  text(errors, "body", d.body, { required: true, min: 10, max: 2000, links: true });
  if (!checked(f.get("consent"))) errors.consent = "form.error.consent";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data: d };
}

export function parseContact(f: FormData): Parsed<ContactInput> {
  const errors: FieldErrors = {};
  const d: ContactInput = { name: clean(f.get("name")), email: clean(f.get("email")), phone: clean(f.get("phone")), subject: clean(f.get("subject")), message: clean(f.get("message"), true) };
  text(errors, "name", d.name, { required: true, max: 120 });
  if (!d.email) errors.email = "form.errorRequired";
  else if (d.email.length > 254 || !EMAIL.test(d.email)) errors.email = "form.error.email";
  if (d.phone && !PHONE.test(d.phone)) errors.phone = "form.error.phone";
  text(errors, "subject", d.subject, { required: true, max: 200 });
  text(errors, "message", d.message, { required: true, min: 10, max: 5000, links: true });
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data: d };
}

export function parseTestimony(f: FormData): Parsed<TestimonyInput> {
  const errors: FieldErrors = {};
  const rawDisplay = clean(f.get("display"));
  const display = (["FULL_NAME", "FIRST_NAME", "ANONYMOUS"] as const).find((x) => x === rawDisplay) ?? "ANONYMOUS";
  const d: TestimonyInput = { title: clean(f.get("title")), body: clean(f.get("body"), true), display, name: clean(f.get("name")), contact: clean(f.get("contact")) };
  text(errors, "title", d.title, { required: true, max: 200 });
  text(errors, "body", d.body, { required: true, min: 30, max: 5000, links: true });
  text(errors, "name", d.name, { required: display !== "ANONYMOUS", max: 120 });
  text(errors, "contact", d.contact, { max: 254 });
  if (d.contact && !EMAIL.test(d.contact) && !PHONE.test(d.contact)) errors.contact = "form.error.contact";
  if (!checked(f.get("consentPublish"))) errors.consentPublish = "form.error.consent";
  if (!checked(f.get("consentOthers"))) errors.consentOthers = "form.error.consent";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data: d };
}

/** The name shown publicly for an accepted testimony, from the submitter's own choice. */
export function displayNameFor(display: TestimonyInput["display"], name: string): string {
  if (display === "ANONYMOUS") return "";
  if (display === "FIRST_NAME") return name.split(/\s+/)[0] ?? "";
  return name;
}
