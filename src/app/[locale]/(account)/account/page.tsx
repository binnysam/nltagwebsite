import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Divider, Heading, Stack, Text } from "@/design-system/primitives";
import { t, type Locale } from "@/content/ui-strings";
import { getAuth } from "@/server/auth/auth";
import { requirePermission, AuthzError } from "@/server/auth/session";
import { AccountPage } from "../page-parts";
import { SessionActions } from "./SessionActions";
import styles from "../account.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your account" };

/**
 * Minimal signed-in page for Phase 4b: who is signed in and on which devices. The member
 * dashboard (status, ID, household) is Phase 4d.
 */
export default async function AccountHome({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const L = (k: Parameters<typeof t>[0]) => t(k, locale);
  const h = await headers();
  let current;
  try {
    current = await requirePermission(h, "account.manage_own");
  } catch (e) {
    if (e instanceof AuthzError) redirect(`/${locale}/sign-in`);
    throw e;
  }
  const sessions = await getAuth().api.listSessions({ headers: h });
  const fmt = new Intl.DateTimeFormat(locale === "ta" ? "ta-IN" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kuwait" });

  return (
    <AccountPage locale={locale} title={L("account.title")} lead={`${current.name} · ${current.email}`}>
      <Stack gap={4}>
        <Heading level={2} styleAs="h3">{L("account.sessions")}</Heading>
        <ul className={styles.sessionList}>
          {sessions.map((s, i) => (
            <li key={s.id}>
              {i > 0 ? <Divider /> : null}
              <Text>
                {fmt.format(new Date(s.createdAt))}
                {s.id === current.sessionId ? ` · ${L("account.thisDevice")}` : ""}
              </Text>
              {s.userAgent ? <Text variant="small" tone="secondary">{s.userAgent.slice(0, 120)}</Text> : null}
            </li>
          ))}
        </ul>
        <SessionActions locale={locale} />
      </Stack>
    </AccountPage>
  );
}
