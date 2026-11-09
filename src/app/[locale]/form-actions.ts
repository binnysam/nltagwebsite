"use server";

import { issueFormToken } from "@/server/forms/protection";
import { submitContact, submitPrayer, submitTestimony, type SubmitResult } from "@/server/forms/service";
import { log } from "@/server/security/log";
import type { PublicFormState } from "./_components/forms/form-state";

/**
 * Public form submissions (server actions; Next.js checks the Origin header, so other sites cannot
 * post them). Every rule is in src/server/forms. Personal data is never logged.
 */
type Submit = (locale: "ta" | "en", f: FormData) => Promise<SubmitResult>;

const KEEP: Record<string, readonly string[]> = {
  prayer: ["name", "contact", "body"],
  contact: ["name", "email", "phone", "subject", "message"],
  testimony: ["title", "body", "display", "name", "contact"],
};

async function handle(form: "prayer" | "contact" | "testimony", submit: Submit, prev: PublicFormState, f: FormData): Promise<PublicFormState> {
  const locale = f.get("locale") === "en" ? "en" : "ta";
  const seq = prev.seq + 1;
  const token = issueFormToken(form);
  const values = Object.fromEntries(KEEP[form]!.map((k) => [k, typeof f.get(k) === "string" ? String(f.get(k)).slice(0, 6000) : ""]));
  try {
    const r = await submit(locale, f);
    if (r.kind === "received") return { status: "received", errors: {}, values: {}, token, seq };
    if (r.kind === "invalid") return { status: "invalid", errors: r.errors, values, token, seq };
    return { status: r.kind, errors: {}, values, token, seq };
  } catch (error) {
    log("error", "form.submit_failed", { form, error });
    return { status: "failed", errors: {}, values, token, seq };
  }
}

export async function prayerAction(prev: PublicFormState, f: FormData) {
  return handle("prayer", submitPrayer, prev, f);
}
export async function contactAction(prev: PublicFormState, f: FormData) {
  return handle("contact", submitContact, prev, f);
}
export async function testimonyAction(prev: PublicFormState, f: FormData) {
  return handle("testimony", submitTestimony, prev, f);
}
