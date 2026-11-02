import { Button, DataTable, SelectField } from "@/design-system/components";
import { Surface, Text } from "@/design-system/primitives";
import { listAudit } from "@/server/cms/service";
import { requireStaffPage } from "../_lib/staff";
import { AdminShell } from "../_components/AdminShell";
import { PageHead, when, one } from "../_components/parts";
import styles from "../admin.module.css";

export const metadata = { title: "Audit log" };

const FILTERS = [
  { value: "", label: "All actions" },
  { value: "content.", label: "Content" },
  { value: "testimony.", label: "Testimony permission" },
  { value: "bible.", label: "Bible permission" },
  { value: "verse.", label: "Verse schedule" },
  { value: "media.", label: "Media" },
  { value: "role.", label: "Roles" },
  { value: "auth.", label: "Sign-in and accounts" },
  { value: "policy.", label: "Denied requests" },
];

/** Church Admin only (audit.read). Rows hold ids and action names, no personal data. */
export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireStaffPage("audit.read");
  const sp = await searchParams;
  const filter = FILTERS.find((f) => f.value === one(sp.action))?.value ?? "";
  const rows = await listAudit(ctx, { actionPrefix: filter, limit: 200 });
  return (
    <AdminShell ctx={ctx}>
      <PageHead title="Audit log" lead="The latest 200 administrative and security events. Entries are kept for the record and cannot be edited." />
      <form className={styles.filters} method="get" aria-label="Filter the audit log">
        <SelectField id="action" name="action" label="Show" options={FILTERS} defaultValue={filter} />
        <span />
        <Button type="submit" variant="secondary">Apply</Button>
      </form>
      {rows.length === 0 ? (
        <Surface><Text>No entries.</Text></Surface>
      ) : (
        <DataTable caption="Audit log entries" captionHidden>
          <thead>
            <tr>
              <th scope="col">When (Kuwait)</th>
              <th scope="col">Who</th>
              <th scope="col">Action</th>
              <th scope="col">Item</th>
              <th scope="col">Detail</th>
              <th scope="col">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className={styles.meta}>{when(r.createdAt)}</td>
                <td>{r.actorName ?? "System"}</td>
                <td><code>{r.action}</code></td>
                <td className={styles.meta}>{r.entity ? `${r.entity} ${r.entityId ? r.entityId.slice(0, 8) : ""}` : "—"}</td>
                <td className={styles.meta}>{r.reason ?? ""}</td>
                <td>{r.outcome === "SUCCESS" ? "Success" : r.outcome === "DENIED" ? "Denied" : "Failed"}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </AdminShell>
  );
}
