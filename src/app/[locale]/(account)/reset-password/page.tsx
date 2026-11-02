import type { Metadata } from "next";
import Link from "next/link";
import { Text } from "@/design-system/primitives";
import { t, type Locale } from "@/content/ui-strings";
import { AuthForm } from "../AuthForm";
import { AccountPage } from "../page-parts";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: t("auth.reset.title", locale), referrer: "no-referrer" };
}

/** Reached from the emailed link via Better Auth, which appends ?token= (or ?error=INVALID_TOKEN). */
export default async function ResetPasswordPage({
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
    <AccountPage locale={locale} title={L("auth.reset.title")}>
      {valid ? (
        <AuthForm mode="reset" locale={locale} token={token} />
      ) : (
        <Text role="alert">
          {L("auth.reset.invalid")} <Link href={`/${locale}/forgot-password`}>{L("auth.forgot.title")}</Link>
        </Text>
      )}
    </AccountPage>
  );
}
