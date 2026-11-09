import { notFound } from "next/navigation";
import { Button, ConfirmButton } from "@/design-system/components";
import { Heading, Surface, Text } from "@/design-system/primitives";
import { CmsError } from "@/server/cms/service";
import { PRAYER_STATUSES } from "@/server/db/schema";
import { getPrayer, publicFormsEnabled } from "@/server/forms/service";
import { can } from "@/server/policy/permissions";
import { prayerDeleteAction, prayerStatusAction } from "../../inbox-actions";
import { requireStaffPage } from "../../_lib/staff";
import { AdminShell } from "../../_components/AdminShell";
import { PageHead, ResultNotice, when, one } from "../../_components/parts";
import { PRAYER_STATUS_LABEL } from "../../_lib/labels";
import styles from "../../admin.module.css";

export const metadata = { title: "Prayer request" };

export default async function PrayerDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!publicFormsEnabled()) notFound();
  const ctx = await requireStaffPage("prayer.read");
  const { id } = await params;
  const sp = await searchParams;
  let r;
  try {
    r = await getPrayer(ctx, id);
  } catch (e) {
    if (e instanceof CmsError) notFound();
    throw e;
  }
  const canManage = can(ctx.actor.principal, "prayer.manage");
  return (
    <AdminShell ctx={ctx}>
      <PageHead title="Prayer request" lead={`Received ${when(r.createdAt)} (Kuwait) · ${r.locale === "ta" ? "Tamil" : "English"} · ${PRAYER_STATUS_LABEL[r.status]}`} back={{ href: "/admin/prayer", label: "All prayer requests" }} />
      <ResultNotice done={one(sp.done)} error={one(sp.error)} />
      <Surface>
        <Heading level={2} styleAs="h3">Request</Heading>
        <Text lang={r.locale} className={styles.preserve}>{r.body}</Text>
        <Heading level={2} styleAs="h3">From</Heading>
        <Text>{r.name || "Anonymous"}</Text>
        <Heading level={2} styleAs="h3">Contact</Heading>
        <Text>{r.contactRequested ? `Wants to be contacted: ${r.contact}` : r.contact ? `${r.contact} (did not ask to be contacted)` : "None given"}</Text>
      </Surface>
      {canManage ? (
        <section className={styles.section} aria-labelledby="actions-h">
          <Heading level={2} styleAs="h3" id="actions-h">Status</Heading>
          <div className={styles.workflow}>
            {PRAYER_STATUSES.filter((s) => s !== r.status).map((s) => (
              <form key={s} action={prayerStatusAction}>
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="status" value={s} />
                <Button type="submit" variant="secondary">Mark as {PRAYER_STATUS_LABEL[s].toLowerCase()}</Button>
              </form>
            ))}
            {can(ctx.actor.principal, "prayer.delete") ? (
              <form action={prayerDeleteAction}>
                <input type="hidden" name="id" value={r.id} />
                <ConfirmButton label="Delete permanently" title="Delete this prayer request?" message={<p>The request is removed from the database and cannot be recovered. The audit log keeps only the fact that it was deleted.</p>} confirmLabel="Delete permanently" />
              </form>
            ) : null}
          </div>
        </section>
      ) : null}
    </AdminShell>
  );
}
