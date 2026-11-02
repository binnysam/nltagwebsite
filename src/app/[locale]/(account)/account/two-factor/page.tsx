import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Notice } from "@/design-system/components";
import { Text } from "@/design-system/primitives";
import { t, type Locale } from "@/content/ui-strings";
import { getAuth } from "@/server/auth/auth";
import { getCurrentUser, mustEnrollTwoFactor } from "@/server/auth/session";
import { log } from "@/server/security/log";
import { AccountPage } from "../../page-parts";
import { TwoFactorSetup } from "./TwoFactorSetup";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: t("twoFactor.title", locale) };
}

/** How many recovery codes are left (the codes themselves never leave the server here). */
async function remainingCodes(userId: string): Promise<number | null> {
  try {
    const r = await getAuth().api.viewBackupCodes({ body: { userId } });
    return Array.isArray(r.backupCodes) ? r.backupCodes.length : null;
  } catch (error) {
    log("warn", "two_factor.count_failed", { error });
    return null;
  }
}

/**
 * Two-factor setup and management for the signed-in person (Phase 6b). Every staff member can use
 * it; Church Admins must (the admin sends them here until it is on). Behind the accounts gate.
 */
export default async function TwoFactorSettings({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const L = (k: Parameters<typeof t>[0]) => t(k, locale);
  const me = await getCurrentUser(await headers());
  if (!me) redirect(`/${locale}/sign-in`);
  const enabled = me.principal.twoFactorEnabled;
  const remaining = enabled ? await remainingCodes(me.userId) : null;

  return (
    <AccountPage
      locale={locale}
      title={L("twoFactor.title")}
      lead={L("twoFactor.lead")}
      links={<Text><Link href={`/${locale}/account`}>{L("account.back")}</Link></Text>}
    >
      {mustEnrollTwoFactor(me) ? <Notice tone="warning" title={L("twoFactor.required")} /> : null}
      <TwoFactorSetup locale={locale} enabled={enabled} remaining={remaining} />
    </AccountPage>
  );
}
