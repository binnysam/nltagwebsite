import type { Metadata } from "next";
import Link from "next/link";
import { Text } from "@/design-system/primitives";
import { t, type Locale } from "@/content/ui-strings";
import { AuthForm } from "../AuthForm";
import { AccountPage, googleEnabled } from "../page-parts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Create an account" };

/**
 * Creating an account does not make anyone a member. Membership applications and admin approval
 * come in Phase 4d; Google sign-in never approves membership.
 */
export default async function SignUpPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const L = (k: Parameters<typeof t>[0]) => t(k, locale);
  return (
    <AccountPage locale={locale} title={L("auth.signUp.title")} links={<Text><Link href={`/${locale}/sign-in`}>{L("auth.haveAccount")}</Link></Text>}>
      <AuthForm mode="signUp" locale={locale} googleEnabled={googleEnabled()} />
    </AccountPage>
  );
}
