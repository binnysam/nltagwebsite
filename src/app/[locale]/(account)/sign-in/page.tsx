import type { Metadata } from "next";
import Link from "next/link";
import { Text } from "@/design-system/primitives";
import { t, type Locale } from "@/content/ui-strings";
import { AuthForm } from "../AuthForm";
import { AccountPage, googleEnabled } from "../page-parts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const L = (k: Parameters<typeof t>[0]) => t(k, locale);
  return (
    <AccountPage
      locale={locale}
      title={L("auth.signIn.title")}
      links={
        <>
          <Text><Link href={`/${locale}/forgot-password`}>{L("auth.forgot.link")}</Link></Text>
          <Text><Link href={`/${locale}/sign-up`}>{L("auth.noAccount")}</Link></Text>
        </>
      }
    >
      <AuthForm mode="signIn" locale={locale} googleEnabled={googleEnabled()} />
    </AccountPage>
  );
}
