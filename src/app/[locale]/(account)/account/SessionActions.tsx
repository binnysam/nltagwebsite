"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/design-system/components";
import { Cluster } from "@/design-system/primitives";
import { t, type Locale } from "@/content/ui-strings";
import { authClient } from "@/lib/auth-client";

export function SessionActions({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"out" | "others" | null>(null);
  const L = (k: Parameters<typeof t>[0]) => t(k, locale);
  return (
    <Cluster>
      <Button
        variant="secondary"
        loading={busy === "others"}
        loadingLabel={L("form.loading")}
        onClick={async () => {
          setBusy("others");
          await authClient.revokeOtherSessions();
          setBusy(null);
          router.refresh();
        }}
      >
        {L("account.signOutOthers")}
      </Button>
      <Button
        variant="tertiary"
        loading={busy === "out"}
        loadingLabel={L("form.loading")}
        onClick={async () => {
          setBusy("out");
          await authClient.signOut();
          router.push(`/${locale}/sign-in`);
        }}
      >
        {L("account.signOut")}
      </Button>
    </Cluster>
  );
}
