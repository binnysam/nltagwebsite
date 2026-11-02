import type { Metadata } from "next";
import { t, type Locale } from "@/content/ui-strings";
import { AccountPage } from "../page-parts";
import { TwoFactorChallenge } from "./TwoFactorChallenge";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: t("twoFactor.challenge.title", locale) };
}

/** Sign-in step 2 (Phase 6b). Behind the accounts gate like every account page (layout.tsx). */
export default async function TwoFactorPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  return (
    <AccountPage locale={locale} title={t("twoFactor.challenge.title", locale)} lead={t("twoFactor.challenge.lead", locale)}>
      <TwoFactorChallenge locale={locale} />
    </AccountPage>
  );
}
