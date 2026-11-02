import { DataTable } from "@/design-system/components";
import { Heading, Text } from "@/design-system/primitives";
import { formatWhen, formatWhere, schedule } from "@/content/schedule";
import styles from "../admin.module.css";

/** The fixed Gate 0 schedule, read-only. Changing it needs owner approval and a code change (src/content/schedule.ts). */
export function RegularSchedule() {
  return (
    <section className={styles.section} aria-labelledby="regular-h">
      <Heading level={2} styleAs="h3" id="regular-h">Regular schedule</Heading>
      <Text variant="small" tone="secondary" measure>
        Approved at Gate 0 and shown here for reference. These times are not edited in the admin; ask the website owner to change them. Cottage meeting host addresses are never published.
      </Text>
      <DataTable caption="Regular schedule" captionHidden>
        <thead>
          <tr>
            <th scope="col">Meeting</th>
            <th scope="col">When (Kuwait time)</th>
            <th scope="col">Where</th>
          </tr>
        </thead>
        <tbody>
          {schedule.map((s) => (
            <tr key={s.id}>
              <th scope="row">
                <span className={styles.titleStack}>
                  <span lang="ta">{s.name.ta}</span>
                  <span>{s.name.en}</span>
                </span>
              </th>
              <td>{formatWhen(s, "en")}</td>
              <td>{formatWhere(s, "en")}</td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </section>
  );
}
