import type { Metadata } from "next";
import Link from "next/link";
import { Text } from "@/design-system/primitives";
import { t, type Locale } from "@/content/ui-strings";
import { AuthForm } from "../AuthForm";
import { AccountPage } from "../page-parts";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: t("auth.setPassword.title", locale), referrer: "no-referrer" };
}

/**
 * R4 mailbox-first (D1, D9): the first password of a requested account. Reached from the emailed
 * set-password link via Better Auth, which appends ?token= (or ?error=INVALID_TOKEN). Same token
 * flow as reset-password; only the wording differs. Using the link also verifies the address.
 */
export default async function SetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { locale } = await params;
  const { token, error } = await searchParams;
  const L = (k: Parameters<typeof t>[0]) => t(k, locale);
  const valid = Boolean(token) && !error && /^[A-Za-z0-9_-]{8,128}$/.test(token ?? "");
  return (
    <AccountPage locale={locale} title={L("auth.setPassword.title")}>
      {valid ? (
        <AuthForm mode="setPassword" locale={locale} token={token} />
      ) : (
        <Text role="alert">
          {L("auth.reset.invalid")} <Link href={`/${locale}/sign-up`}>{L("auth.signUp.title")}</Link>
        </Text>
      )}
    </AccountPage>
  );
}
