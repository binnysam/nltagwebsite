import Link from "next/link";
import { DataTable } from "@/design-system/components";
import { moduleByType } from "@/server/cms/registry";
import type { ListRow } from "@/server/cms/service";
import { StatusTag, Titles, when } from "./parts";
import styles from "../admin.module.css";

/** Shared content table: title (both languages), status in words, the key date, last change. */
export function ContentList({ rows, caption, showType = false, now = new Date() }: { rows: ListRow[]; caption: string; showType?: boolean; now?: Date }) {
  const hasEvents = rows.some((r) => r.type === "EVENT");
  return (
    <DataTable caption={caption} captionHidden>
      <thead>
        <tr>
          <th scope="col">Title</th>
          {showType ? <th scope="col">Type</th> : null}
          <th scope="col">Status</th>
          {hasEvents ? <th scope="col">Starts (Kuwait)</th> : null}
          <th scope="col">Last changed</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <th scope="row">
              <Link className={styles.rowLink} href={`/admin/${moduleByType(r.type).segment}/${r.id}`}>
                <Titles ta={r.titleTa} en={r.titleEn} />
              </Link>
              {r.featured ? <span className={styles.meta}> · Featured</span> : null}
              {r.type === "TESTIMONY" && r.testimonyPermission !== "GRANTED" ? <span className={styles.meta}> · Permission not recorded</span> : null}
            </th>
            {showType ? <td>{moduleByType(r.type).singular}</td> : null}
            <td><StatusTag item={r} now={now} /></td>
            {hasEvents ? <td className={styles.meta}>{when(r.startsAt)}</td> : null}
            <td className={styles.meta}>{when(r.updatedAt)}</td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}
