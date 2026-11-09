import "server-only";
import type { RenderedEmail } from "../email/templates";
import type { FormName } from "./protection";

/**
 * Staff notification emails (English: the admin is English-first, Phase 4c). Content rules
 * (roadmap §5.3, §6, §7; privacy first):
 *   prayer     notice only: no name, contact or request text ever leaves the database by email.
 *   testimony  notice only: the text is read in the admin.
 *   contact    the visitor's message in full (ordinary correspondence the visitor asked the church
 *              to answer), so staff can reply from their mail program.
 * Every message links to the inbox, never to a specific record id in the subject.
 */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function siteUrl(): string {
  try {
    return new URL(process.env.BETTER_AUTH_URL ?? "").origin;
  } catch {
    return "";
  }
}

const INBOX_PATH: Record<FormName, string> = { prayer: "/admin/prayer", contact: "/admin/contact", testimony: "/admin/testimony-submissions" };

export function renderNotification(form: FormName, _id: string, extra: Record<string, string> = {}): RenderedEmail {
  const link = `${siteUrl()}${INBOX_PATH[form]}`;
  if (form === "contact") {
    const lines = [
      "A new message was sent through the website contact form.",
      "",
      `Name: ${extra.name ?? ""}`,
      `Email: ${extra.email ?? ""}`,
      ...(extra.phone ? [`Phone: ${extra.phone}`] : []),
      `Subject: ${extra.subject ?? ""}`,
      "",
      extra.message ?? "",
      "",
      `Contact inbox: ${link}`,
    ];
    return {
      subject: "New contact message (NLTAG website)",
      text: lines.join("\n"),
      html: `<p>A new message was sent through the website contact form.</p><p><strong>Name:</strong> ${esc(extra.name ?? "")}<br><strong>Email:</strong> ${esc(extra.email ?? "")}${extra.phone ? `<br><strong>Phone:</strong> ${esc(extra.phone)}` : ""}<br><strong>Subject:</strong> ${esc(extra.subject ?? "")}</p><p style="white-space:pre-wrap">${esc(extra.message ?? "")}</p><p><a href="${esc(link)}">Open the contact inbox</a></p>`,
    };
  }
  const what = form === "prayer" ? "prayer request" : "testimony submission";
  const text = `A new ${what} was received through the website.\n\nFor privacy, its content is not included in this email. Sign in to read it:\n${link}`;
  return {
    subject: form === "prayer" ? "New prayer request (NLTAG website)" : "New testimony submission (NLTAG website)",
    text,
    html: `<p>A new ${what} was received through the website.</p><p>For privacy, its content is not included in this email.</p><p><a href="${esc(link)}">Sign in to read it</a></p>`,
  };
}
