import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, DataTable, SelectField } from "@/design-system/components";
import { Surface, Text } from "@/design-system/primitives";
import { TESTIMONY_SUBMISSION_STATUSES, type TestimonySubmissionStatus } from "@/server/db/schema";
import { listTestimonySubmissions, publicFormsEnabled } from "@/server/forms/service";
import { requireStaffPage } from "../_lib/staff";
import { DISPLAY_LABEL, SUBMISSION_STATUS_LABEL } from "../_lib/labels";
import { AdminShell } from "../_components/AdminShell";
import { InboxPager } from "../_components/InboxPager";
import { PageHead, ResultNotice, when, one } from "../_components/parts";
import styles from "../admin.module.css";

export const metadata = { title: "Testimony submissions" };

/** Church Admin and Content Editors (submission.read). Nothing here is public until accepted, edited and published. */
export default async function SubmissionsInbox({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!publicFormsEnabled()) notFound();
  const ctx = await requireStaffPage("submission.read");
  const sp = await searchParams;
  const status = (TESTIMONY_SUBMISSION_STATUSES as readonly string[]).includes(one(sp.status) ?? "") ? (one(sp.status) as TestimonySubmissionStatus) : "";
  const data = await listTestimonySubmissions(ctx, { status, page: Number(one(sp.page) ?? 1) });
  return (
    <AdminShell ctx={ctx}>
      <PageHead title="Testimony submissions" lead="Testimonies sent by visitors. Nothing is published automatically: accepting creates a draft testimony, which then goes through the normal review and a Church Admin publishes it." />
      <ResultNotice done={one(sp.done)} error={one(sp.error)} />
      <form className={styles.filters} method="get" aria-label="Filter testimony submissions">
        <SelectField id="status" name="status" label="Status" options={[{ value: "", label: "All" }, ...TESTIMONY_SUBMISSION_STATUSES.map((s) => ({ value: s, label: SUBMISSION_STATUS_LABEL[s] }))]} defaultValue={status} />
        <span />
        <Button type="submit" variant="secondary">Apply</Button>
      </form>
      {data.rows.length === 0 ? (
        <Surface><Text>No submissions.</Text></Surface>
      ) : (
        <DataTable caption="Testimony submissions" captionHidden>
          <thead>
            <tr>
              <th scope="col">Title</th>
              <th scope="col">Name shown as</th>
              <th scope="col">Received (Kuwait)</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.id}>
                <th scope="row"><Link className={styles.rowLink} href={`/admin/testimony-submissions/${r.id}`} lang={r.locale}>{r.title}</Link></th>
                <td>{DISPLAY_LABEL[r.display]}</td>
                <td className={styles.meta}>{when(r.createdAt)}</td>
                <td>{SUBMISSION_STATUS_LABEL[r.status]}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
      <InboxPager base="/admin/testimony-submissions" page={data.page} total={data.total} pageSize={data.pageSize} query={{ status }} />
    </AdminShell>
  );
}
