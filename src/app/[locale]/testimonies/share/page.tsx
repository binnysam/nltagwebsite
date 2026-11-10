import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Notice } from "@/design-system/components";
import { Container, Section } from "@/design-system/primitives";
import { t, type Locale } from "@/content/ui-strings";
import { issueFormToken } from "@/server/forms/protection";
import { formsOpenTo } from "@/server/forms/mode";
import { formAvailable } from "@/server/forms/service";
import { formsViewer } from "@/server/forms/viewer";
import { testimonyAction } from "../../form-actions";
import { PublicShell } from "../../_components/PublicShell";
import { PageHead } from "../../_components/sections";
import { PublicForm } from "../../_components/forms/PublicForm.client";
import { formErrorText, formLabels } from "../../_components/forms/copy";
import { href, pageMetadata } from "../../_components/site";

type Props = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata(locale, "testimonies", { title: t("testimonyForm.title", locale), description: t("testimonyForm.lead", locale), path: "/testimonies/share" });
}

/**
 * Public testimony submission. Never published automatically: staff accept it as a CMS draft and a
 * Church Admin publishes it through the normal workflow (src/server/forms/service.ts).
 */
export default async function ShareTestimonyPage({ params }: Props) {
  const { locale } = await params;
  await connection();
  // Forms off, or staff-only mode and the viewer is not signed-in staff → 404 (src/server/forms/mode.ts).
  const viewer = await formsViewer();
  if (!formsOpenTo(viewer)) notFound();
  const available = formAvailable("testimony", viewer);
  return (
    <PublicShell locale={locale} route="testimonies" currentPath={href(locale, "testimonies")}>
      <PageHead title={t("testimonyForm.title", locale)} lead={t("testimonyForm.lead", locale)} />
      <Container>
        <Section aria-label={t("testimonyForm.title", locale)}>
          {available ? (
            <PublicForm
              id="testimony"
              locale={locale}
              action={testimonyAction}
              initialToken={issueFormToken("testimony")}
              labels={formLabels(locale, "testimonyForm.submit", "testimonyForm.received")}
              errorText={formErrorText(locale)}
              fields={[
                { kind: "text", name: "title", label: t("testimonyForm.field.title", locale), required: true, maxLength: 200 },
                { kind: "textarea", name: "body", label: t("testimonyForm.field.body", locale), required: true, maxLength: 5000, rows: 10 },
                {
                  kind: "select", name: "display", label: t("testimonyForm.field.display", locale), defaultValue: "ANONYMOUS",
                  options: [
                    { value: "ANONYMOUS", label: t("testimonyForm.display.anonymous", locale) },
                    { value: "FIRST_NAME", label: t("testimonyForm.display.first", locale) },
                    { value: "FULL_NAME", label: t("testimonyForm.display.full", locale) },
                  ],
                },
                { kind: "text", name: "name", label: t("form.field.yourName", locale), maxLength: 120, autoComplete: "name" },
                { kind: "text", name: "contact", label: t("form.field.contact", locale), hint: t("testimonyForm.field.contactHint", locale), maxLength: 254, autoComplete: "email" },
                { kind: "checkbox", name: "consentPublish", label: t("testimonyForm.consentPublish", locale), required: true },
                { kind: "checkbox", name: "consentOthers", label: t("testimonyForm.consentOthers", locale), required: true },
              ]}
            />
          ) : (
            <Notice tone="info" title={t("form.unavailable", locale)} />
          )}
        </Section>
      </Container>
    </PublicShell>
  );
}
