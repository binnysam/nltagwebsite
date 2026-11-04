import { churchName } from "@/content/church";
import { t, uiStrings, type Locale, type UiStringKey } from "@/content/ui-strings";

export type EmailKind = "verify" | "reset" | "set-password";

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const KEYS: Record<EmailKind, { subject: UiStringKey; body: UiStringKey }> = {
  verify: { subject: "email.verify.subject", body: "email.verify.body" },
  reset: { subject: "email.reset.subject", body: "email.reset.body" },
  // R4 D9: the first password of a mailbox-first account (Tamil draft-review until gate G-D).
  "set-password": { subject: "email.setPassword.subject", body: "email.setPassword.body" },
};

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export const withChurch = (s: string, locale: Locale) => s.replaceAll("{church}", churchName[locale]);

/**
 * Bilingual account emails: Tamil first (default language), English second. The only personal
 * data in the message is the recipient address it is sent to. The HTML is deliberately plain
 * (no images, no tracking, no remote assets) so it renders in every client and never fetches
 * anything.
 */
export function renderEmail(kind: EmailKind, url: string): RenderedEmail {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("email link must be http(s)");
  const k = KEYS[kind];
  const block = (locale: Locale) => ({
    body: t(k.body, locale),
    ignore: t("email.ignore", locale),
    footer: withChurch(t("email.footer", locale), locale),
  });
  const ta = block("ta");
  const en = block("en");
  const subject = `${t(k.subject, "ta")} · ${t(k.subject, "en")}`;
  const text = [ta.body, url, ta.ignore, "", "—", "", en.body, url, en.ignore, "", ta.footer, en.footer].join("\n");
  const href = escapeHtml(parsed.toString());
  const section = (b: typeof ta, lang: Locale) =>
    `<div lang="${lang}"><p>${escapeHtml(b.body)}</p><p><a href="${href}">${href}</a></p><p>${escapeHtml(b.ignore)}</p></div>`;
  const html = [
    "<!doctype html>",
    '<html lang="ta"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${escapeHtml(subject)}</title></head><body>`,
    section(ta, "ta"),
    "<hr>",
    section(en, "en"),
    `<p lang="ta"><small>${escapeHtml(ta.footer)}</small></p>`,
    `<p lang="en"><small>${escapeHtml(en.footer)}</small></p>`,
    "</body></html>",
  ].join("");
  return { subject, text, html };
}

export type AlertKind = "signin-throttled";

const ALERT_KEYS: Record<AlertKind, { subject: UiStringKey; body: UiStringKey }> = {
  "signin-throttled": { subject: "email.signInThrottled.subject", body: "email.signInThrottled.body" },
};

/**
 * Security alerts to an account holder (no link: an alert should never ask anyone to click).
 * Tamil first once its wording is confirmed by the owner; until then English only, because
 * draft Tamil must not go live (src/content/ui-strings.ts → review status).
 */
export function renderAlertEmail(kind: AlertKind): RenderedEmail {
  const k = ALERT_KEYS[kind];
  const tamilApproved = uiStrings[k.subject].taStatus === "confirmed" && uiStrings[k.body].taStatus === "confirmed";
  const locales: Locale[] = tamilApproved ? ["ta", "en"] : ["en"];
  const subject = locales.map((l) => t(k.subject, l)).join(" · ");
  const footer = (l: Locale) => withChurch(t("email.footer", l), l);
  const text = [...locales.flatMap((l, i) => [...(i ? ["", "—", ""] : []), t(k.body, l)]), "", ...locales.map(footer)].join("\n");
  const html = [
    "<!doctype html>",
    `<html lang="${locales[0]}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`,
    `<title>${escapeHtml(subject)}</title></head><body>`,
    locales.map((l) => `<div lang="${l}"><p>${escapeHtml(t(k.body, l))}</p></div>`).join("<hr>"),
    ...locales.map((l) => `<p lang="${l}"><small>${escapeHtml(footer(l))}</small></p>`),
    "</body></html>",
  ].join("");
  return { subject, text, html };
}
