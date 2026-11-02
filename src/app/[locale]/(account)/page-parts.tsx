import type { ReactNode } from "react";
import { Heading, Stack, Text } from "@/design-system/primitives";
import type { Locale } from "@/content/ui-strings";
import styles from "./account.module.css";

/** Shared page frame: heading, optional lead, the form, then secondary links. */
export function AccountPage({ title, lead, children, links }: { title: string; lead?: string; children: ReactNode; links?: ReactNode; locale: Locale }) {
  return (
    <Stack gap={6} className={styles.column}>
      <Stack gap={3}>
        <Heading level={1}>{title}</Heading>
        {lead ? <Text tone="secondary">{lead}</Text> : null}
      </Stack>
      {children}
      {links ? <Stack gap={2}>{links}</Stack> : null}
    </Stack>
  );
}

export const googleEnabled = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
