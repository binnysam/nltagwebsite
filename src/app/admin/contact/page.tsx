import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, DataTable, SelectField } from "@/design-system/components";
import { Surface, Text } from "@/design-system/primitives";
import { CONTACT_STATUSES, type ContactStatus } from "@/server/db/schema";
import { listContact, publicFormsEnabled } from "@/server/forms/service";
import { requireStaffPage } from "../_lib/staff";
import { CONTACT_STATUS_LABEL } from "../_lib/labels";
import { AdminShell } from "../_components/AdminShell";
import { InboxPager } from "../_components/InboxPager";
import { PageHead, ResultNotice, when, one } from "../_components/parts";
import styles from "../admin.module.css";

export const metadata = { title: "Contact messages" };

/** Church Admin only (contact.read). */
export default async function ContactInbox({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!publicFormsEnabled()) notFound();
  const ctx = await requireStaffPage("contact.read");
  const sp = await searchParams;
  const status = (CONTACT_STATUSES as readonly string[]).includes(one(sp.status) ?? "") ? (one(sp.status) as ContactStatus) : "";
  const data = await listContact(ctx, { status, page: Number(one(sp.page) ?? 1) });
  return (
    <AdminShell ctx={ctx}>
      <PageHead title="Contact messages" lead="Messages sent through the website's contact form. Reply from the church mailbox using the sender's email address." />
      <ResultNotice done={one(sp.done)} error={one(sp.error)} />
      <form className={styles.filters} method="get" aria-label="Filter contact messages">
        <SelectField id="status" name="status" label="Status" options={[{ value: "", label: "All" }, ...CONTACT_STATUSES.map((s) => ({ value: s, label: CONTACT_STATUS_LABEL[s] }))]} defaultValue={status} />
        <span />
        <Button type="submit" variant="secondary">Apply</Button>
      </form>
      {data.rows.length === 0 ? (
        <Surface><Text>No messages.</Text></Surface>
      ) : (
        <DataTable caption="Contact messages" captionHidden>
          <thead>
            <tr>
              <th scope="col">Subject</th>
              <th scope="col">From</th>
              <th scope="col">Received (Kuwait)</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.id}>
                <th scope="row"><Link href={`/admin/contact/${r.id}`} lang={r.locale}>{r.subject}</Link></th>
                <td>{r.name}</td>
                <td className={styles.meta}>{when(r.createdAt)}</td>
                <td>{CONTACT_STATUS_LABEL[r.status]}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
      <InboxPager base="/admin/contact" page={data.page} total={data.total} pageSize={data.pageSize} query={{ status }} />
    </AdminShell>
  );
}
