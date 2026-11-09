import { notFound } from "next/navigation";
import { Button, ConfirmButton } from "@/design-system/components";
import { Heading, Surface, Text } from "@/design-system/primitives";
import { CmsError } from "@/server/cms/service";
import { CONTACT_STATUSES } from "@/server/db/schema";
import { getContact, publicFormsEnabled } from "@/server/forms/service";
import { contactDeleteAction, contactStatusAction } from "../../inbox-actions";
import { requireStaffPage } from "../../_lib/staff";
import { CONTACT_STATUS_LABEL } from "../../_lib/labels";
import { AdminShell } from "../../_components/AdminShell";
import { PageHead, ResultNotice, when, one } from "../../_components/parts";
import styles from "../../admin.module.css";

export const metadata = { title: "Contact message" };

export default async function ContactDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!publicFormsEnabled()) notFound();
  const ctx = await requireStaffPage("contact.read");
  const { id } = await params;
  const sp = await searchParams;
  let m;
  try {
    m = await getContact(ctx, id);
  } catch (e) {
    if (e instanceof CmsError) notFound();
    throw e;
  }
  return (
    <AdminShell ctx={ctx}>
      <PageHead title={m.subject} lead={`Received ${when(m.createdAt)} (Kuwait) · ${m.locale === "ta" ? "Tamil" : "English"} · ${CONTACT_STATUS_LABEL[m.status]}`} back={{ href: "/admin/contact", label: "All messages" }} />
      <ResultNotice done={one(sp.done)} error={one(sp.error)} />
      <Surface>
        <Heading level={2} styleAs="h3">From</Heading>
        <Text>{m.name} · <a href={`mailto:${m.email}`}>{m.email}</a>{m.phone ? ` · ${m.phone}` : ""}</Text>
        <Heading level={2} styleAs="h3">Message</Heading>
        <Text lang={m.locale} className={styles.preserve}>{m.message}</Text>
      </Surface>
      <section className={styles.section} aria-labelledby="actions-h">
        <Heading level={2} styleAs="h3" id="actions-h">Status</Heading>
        <div className={styles.workflow}>
          {CONTACT_STATUSES.filter((s) => s !== m.status).map((s) => (
            <form key={s} action={contactStatusAction}>
              <input type="hidden" name="id" value={m.id} />
              <input type="hidden" name="status" value={s} />
              <Button type="submit" variant="secondary">Mark as {CONTACT_STATUS_LABEL[s].toLowerCase()}</Button>
            </form>
          ))}
          <form action={contactDeleteAction}>
            <input type="hidden" name="id" value={m.id} />
            <ConfirmButton label="Delete permanently" title="Delete this message?" message={<p>The message is removed from the database and cannot be recovered.</p>} confirmLabel="Delete permanently" />
          </form>
        </div>
      </section>
    </AdminShell>
  );
}
