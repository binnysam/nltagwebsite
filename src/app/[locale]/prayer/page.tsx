import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Notice } from "@/design-system/components";
import { Container, Section } from "@/design-system/primitives";
import { t, type Locale } from "@/content/ui-strings";
import { issueFormToken } from "@/server/forms/protection";
import { formAvailable, publicFormsEnabled } from "@/server/forms/service";
import { prayerAction } from "../form-actions";
import { PublicShell } from "../_components/PublicShell";
import { PageHead } from "../_components/sections";
import { PublicForm } from "../_components/forms/PublicForm.client";
import { formErrorText, formLabels } from "../_components/forms/copy";
import { pageMetadata } from "../_components/site";

type Props = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata(locale, "prayer", { title: t("prayer.title", locale), description: t("prayer.lead", locale) });
}

/**
 * Prayer request form. Stored encrypted, read only by the Church Admin and the Prayer Team, never
 * published, kept until deleted (src/server/forms). Name and contact are optional.
 */
export default async function PrayerPage({ params }: Props) {
  const { locale } = await params;
  if (!publicFormsEnabled()) notFound(); // needs migration 0004 (switch NLTAG_PUBLIC_FORMS)
  await connection(); // the form token carries the time the page was served
  const available = formAvailable("prayer");
  return (
    <PublicShell locale={locale} route="prayer">
      <PageHead title={t("prayer.title", locale)} lead={t("prayer.lead", locale)} />
      <Container>
        <Section aria-label={t("prayer.title", locale)}>
          {available ? (
            <PublicForm
              id="prayer"
              locale={locale}
              action={prayerAction}
              initialToken={issueFormToken("prayer")}
              labels={formLabels(locale, "prayer.submit", "prayer.received")}
              errorText={formErrorText(locale)}
              fields={[
                { kind: "textarea", name: "body", label: t("prayer.field.body", locale), required: true, maxLength: 2000, rows: 7 },
                { kind: "text", name: "name", label: t("form.field.yourName", locale), hint: t("form.field.nameHint", locale), maxLength: 120, autoComplete: "name" },
                { kind: "text", name: "contact", label: t("form.field.contact", locale), hint: t("prayer.field.contactHint", locale), maxLength: 254, autoComplete: "email" },
                { kind: "checkbox", name: "contactRequested", label: t("prayer.field.contactRequested", locale) },
                { kind: "checkbox", name: "consent", label: t("prayer.consent", locale), required: true },
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
