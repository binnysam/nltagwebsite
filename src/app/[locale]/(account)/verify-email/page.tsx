import type { Metadata } from "next";
import Link from "next/link";
import { Text } from "@/design-system/primitives";
import { t, type Locale } from "@/content/ui-strings";
import { AccountPage } from "../page-parts";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: t("auth.verify.title", locale) };
}

/** Landing page after the verification link. Better Auth adds ?error= when the link is bad or expired. */
export default async function VerifyEmailPage({ params, searchParams }: { params: Promise<{ locale: Locale }>; searchParams: Promise<{ error?: string }> }) {
  const { locale } = await params;
  const { error } = await searchParams;
  const L = (k: Parameters<typeof t>[0]) => t(k, locale);
  return (
    <AccountPage locale={locale} title={L(error ? "auth.reset.invalid" : "auth.verify.done")}>
      <Text>
        <Link href={`/${locale}/${error ? "sign-in" : "account"}`}>{L(error ? "auth.signIn.title" : "account.title")}</Link>
      </Text>
    </AccountPage>
  );
}
