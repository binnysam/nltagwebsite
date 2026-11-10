import type { Metadata } from "next";
import { connection } from "next/server";
import { Notice } from "@/design-system/components";
import { Container, Section } from "@/design-system/primitives";
import { issueFormToken } from "@/server/forms/protection";
import { formsOpenTo } from "@/server/forms/mode";
import { formAvailable } from "@/server/forms/service";
import { formsViewer } from "@/server/forms/viewer";
import { contactAction } from "../form-actions";
import { PublicForm } from "../_components/forms/PublicForm.client";
import { formErrorText, formLabels } from "../_components/forms/copy";
import { MapPlaceholder } from "../_components/MapPlaceholder";
import { t, type Locale } from "@/content/ui-strings";
import { loadPage, RESERVED_PAGE_SLUGS } from "@/server/cms/public-site";
import { PublicShell } from "../_components/PublicShell";
import { Empty, PageBody, PageHead, PublicSection, VisitFacts } from "../_components/sections";
import { pageMetadata, routeLabel } from "../_components/site";

type Props = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const page = await loadPage(RESERVED_PAGE_SLUGS.contact, locale);
  return pageMetadata(locale, "contact", { title: page?.seoTitle || page?.title || undefined, description: page?.seoDescription || page?.summary });
}

/**
 * Contact and visit: Gate 0 facts only (NECK, Friday main worship; never an address), then the
 * church's own published CMS page "contact" (phone, email or directions exactly as they publish).
 */
export default async function ContactPage({ params }: Props) {
  const { locale } = await params;
  await connection(); // the contact form token carries the time the page was served
  const page = await loadPage(RESERVED_PAGE_SLUGS.contact, locale);
  // The message form: everyone with NLTAG_PUBLIC_FORMS=1; signed-in staff only in staff-only mode.
  const viewer = await formsViewer();
  return (
    <PublicShell locale={locale} route="contact">
      <PageHead title={page?.title || routeLabel(locale, "contact")} lead={page?.summary} />
      <PublicSection id="visit" title={t("section.visit", locale)}>
        <VisitFacts locale={locale} />
        <MapPlaceholder locale={locale} />
      </PublicSection>
      <Container>
        <Section aria-label={routeLabel(locale, "contact")}>
          {page?.bodyMd ? <PageBody item={page} /> : page ? null : <Empty locale={locale} />}
        </Section>
      </Container>
      {formsOpenTo(viewer) ? (
      <PublicSection id="message" title={t("contactForm.title", locale)}>
        {formAvailable("contact", viewer) ? (
          <PublicForm
            id="contact"
            locale={locale}
            action={contactAction}
            initialToken={issueFormToken("contact")}
            intro={t("contactForm.privacy", locale)}
            labels={formLabels(locale, "contactForm.submit", "contactForm.received")}
            errorText={formErrorText(locale)}
            fields={[
              { kind: "text", name: "name", label: t("form.field.yourName", locale), required: true, maxLength: 120, autoComplete: "name" },
              { kind: "email", name: "email", label: t("auth.field.email", locale), required: true, maxLength: 254, autoComplete: "email" },
              { kind: "tel", name: "phone", label: t("form.field.phone", locale), maxLength: 40, autoComplete: "tel" },
              { kind: "text", name: "subject", label: t("form.field.subject", locale), required: true, maxLength: 200 },
              { kind: "textarea", name: "message", label: t("form.field.message", locale), required: true, maxLength: 5000, rows: 7 },
            ]}
          />
        ) : (
          <Notice tone="info" title={t("form.unavailable", locale)} />
        )}
      </PublicSection>
      ) : null}
    </PublicShell>
  );
}
