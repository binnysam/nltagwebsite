import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, DataTable, SelectField } from "@/design-system/components";
import { Surface, Text } from "@/design-system/primitives";
import { PRAYER_STATUSES, type PrayerStatus } from "@/server/db/schema";
import { listPrayer, publicFormsEnabled } from "@/server/forms/service";
import { requireStaffPage } from "../_lib/staff";
import { PRAYER_STATUS_LABEL } from "../_lib/labels";
import { AdminShell } from "../_components/AdminShell";
import { InboxPager } from "../_components/InboxPager";
import { PageHead, ResultNotice, when, one } from "../_components/parts";
import styles from "../admin.module.css";

export const metadata = { title: "Prayer requests" };

/**
 * Church Admin and Prayer Team only (prayer.read). Content Editors and everyone else get 404.
 * The list shows no names or text; opening a request is recorded in the audit log.
 */
export default async function PrayerInbox({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!publicFormsEnabled()) notFound();
  const ctx = await requireStaffPage("prayer.read");
  const sp = await searchParams;
  const status = (PRAYER_STATUSES as readonly string[]).includes(one(sp.status) ?? "") ? (one(sp.status) as PrayerStatus) : "";
  const data = await listPrayer(ctx, { status, page: Number(one(sp.page) ?? 1) });
  return (
    <AdminShell ctx={ctx}>
      <PageHead title="Prayer requests" lead="Readable only by the Church Admin and the prayer team. Requests are kept until someone deletes them. Opening a request is recorded in the audit log." />
      <ResultNotice done={one(sp.done)} error={one(sp.error)} />
      <form className={styles.filters} method="get" aria-label="Filter prayer requests">
        <SelectField id="status" name="status" label="Status" options={[{ value: "", label: "All" }, ...PRAYER_STATUSES.map((s) => ({ value: s, label: PRAYER_STATUS_LABEL[s] }))]} defaultValue={status} />
        <span />
        <Button type="submit" variant="secondary">Apply</Button>
      </form>
      {data.rows.length === 0 ? (
        <Surface><Text>No prayer requests.</Text></Surface>
      ) : (
        <DataTable caption="Prayer requests" captionHidden>
          <thead>
            <tr>
              <th scope="col">Received (Kuwait)</th>
              <th scope="col">Language</th>
              <th scope="col">Wants contact</th>
              <th scope="col">Status</th>
              <th scope="col">Email notice</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.id}>
                <th scope="row"><Link className={styles.rowLink} href={`/admin/prayer/${r.id}`}>{when(r.createdAt)}</Link></th>
                <td>{r.locale === "ta" ? "Tamil" : "English"}</td>
                <td>{r.contactRequested ? "Yes" : "No"}</td>
                <td>{PRAYER_STATUS_LABEL[r.status]}</td>
                <td className={styles.meta}>{r.notifiedAt ? "Sent" : "Not sent"}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
      <InboxPager base="/admin/prayer" page={data.page} total={data.total} pageSize={data.pageSize} query={{ status }} />
    </AdminShell>
  );
}
