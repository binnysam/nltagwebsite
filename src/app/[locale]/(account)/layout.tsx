import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Container, Section } from "@/design-system/primitives";

/** Account pages are never indexed or cached (architecture §4). Headers are also set in next.config.ts. */
export const metadata: Metadata = { robots: { index: false, follow: false, nocache: true } };

export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <main id="main">
      <Container>
        <Section>{children}</Section>
      </Container>
    </main>
  );
}
