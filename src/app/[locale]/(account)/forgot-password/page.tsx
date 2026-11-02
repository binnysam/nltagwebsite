import type { Metadata } from "next";
import Link from "next/link";
import { Text } from "@/design-system/primitives";
import { t, type Locale } from "@/content/ui-strings";
import { AuthForm } from "../AuthForm";
import { AccountPage } from "../page-parts";

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: t("auth.forgot.title", locale) };
}

export default async function ForgotPasswordPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const L = (k: Parameters<typeof t>[0]) => t(k, locale);
  return (
    <AccountPage locale={locale} title={L("auth.forgot.title")} links={<Text><Link href={`/${locale}/sign-in`}>{L("auth.signIn.title")}</Link></Text>}>
      <AuthForm mode="forgot" locale={locale} />
    </AccountPage>
  );
}
