import type { ReactNode } from "react";
import { Heading, Text } from "@/design-system/primitives";
import styles from "./section-intro.module.css";

export interface SectionIntroProps {
  /** id for the heading so the section can use aria-labelledby. */
  headingId: string;
  eyebrow?: string;
  title: string;
  lead?: string;
  /** At most one pill CTA (ButtonLink). */
  action?: ReactNode;
  /** Heading level inside the page outline. Defaults to 2. */
  level?: 2 | 3;
}

/** Left-aligned section introduction used before lists, grids and cards. */
export function SectionIntro({ headingId, eyebrow, title, lead, action, level = 2 }: SectionIntroProps) {
  return (
    <div className={styles.intro}>
      {eyebrow ? <Text variant="eyebrow">{eyebrow}</Text> : null}
      <Heading level={level} styleAs="display-l" id={headingId}>
        {title}
      </Heading>
      {lead ? <p className={styles.lead}>{lead}</p> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
