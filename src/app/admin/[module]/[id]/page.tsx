import { notFound } from "next/navigation";
import { ButtonLink, ConfirmButton, Button } from "@/design-system/components";
import { Heading, Surface, Text } from "@/design-system/primitives";
import { can } from "@/server/policy/permissions";
import { moduleBySegment } from "@/server/cms/registry";
import { canPerform, publishBlocker } from "@/server/cms/rules";
import { CmsError, getItemForEdit } from "@/server/cms/service";
import { testimonyPermissionAction, workflowAction } from "../../actions";
import { requireStaffPage } from "../../_lib/staff";
import { formModule, mediaChoices, toFormValues } from "../../_lib/form-values";
import { AdminShell } from "../../_components/AdminShell";
import { ContentForm } from "../../_components/ContentForm.client";
import { PageHead, ResultNotice, StatusTag, when, one } from "../../_components/parts";
import styles from "../../admin.module.css";

type Params = Promise<{ module: string; id: string }>;

export const metadata = { title: "Edit" };

export default async function EditItemPage({ params, searchParams }: { params: Params; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { module, id } = await params;
  const mod = moduleBySegment(module);
  if (!mod || !/^[0-9a-f-]{36}$/.test(id)) notFound();
  const ctx = await requireStaffPage();
  const sp = await searchParams;
  const item = await getItemForEdit(ctx, id).catch((e) => {
    if (e instanceof CmsError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  if (item.type !== mod.type) notFound();

  const p = ctx.actor.principal;
  const state = { type: item.type, status: item.status, deleted: Boolean(item.deletedAt), testimonyPermission: item.testimonyPermission };
  const allowed = (a: Parameters<typeof canPerform>[2]) => canPerform(p, state, a);
  const canEdit = allowed("edit");
  const isPublisher = can(p, "content.publish");
  const blocker = item.status !== "PUBLISHED" && isPublisher ? publishBlocker(state) : null;
  const media = mod.type === "SERMON" || mod.type === "MINISTRY" ? await mediaChoices(ctx) : [];
  const title = item.translations.en.title || item.translations.ta.title || `Untitled ${mod.singular}`;
  const readOnlyReason = item.deletedAt
    ? "This item is deleted. Restore it to edit."
    : `This ${mod.singular} is ${item.status === "PUBLISHED" ? "published" : "archived"}. Only a Church Admin can change it.`;

  const hidden = (
    <>
      <input type="hidden" name="id" value={item.id} />
      <input type="hidden" name="type" value={item.type} />
    </>
  );

  return (
    <AdminShell ctx={ctx}>
      <PageHead
        title={title}
        back={{ href: `/admin/${mod.segment}`, label: mod.label }}
        actions={!item.deletedAt ? <ButtonLink href={`/admin/preview/${item.id}`} variant="secondary">Preview</ButtonLink> : null}
      />
      <ResultNotice done={one(sp.done)} error={one(sp.error)} />

      <Surface className={styles.card}>
        <div className={styles.statusLine}>
          <StatusTag item={{ ...item, testimonyPermission: item.testimonyPermission }} />
          <span className={styles.meta}>Last changed {when(item.updatedAt)}</span>
          {item.firstPublishedAt ? <span className={styles.meta}>First published {when(item.firstPublishedAt)}</span> : null}
          {item.publishAt ? <span className={styles.meta}>Publish from {when(item.publishAt)}</span> : null}
          {item.expiresAt ? <span className={styles.meta}>Expires {when(item.expiresAt)}</span> : null}
        </div>
        {blocker ? <Text variant="small">{blocker}</Text> : null}
        <div className={styles.workflow}>
          {allowed("submit") ? (
            <form action={workflowAction}>{hidden}<Button type="submit" name="action" value="submit">Submit for review</Button></form>
          ) : null}
          {allowed("publish") ? (
            <form action={workflowAction}>{hidden}<Button type="submit" name="action" value="publish">{item.publishAt && item.publishAt > new Date() ? "Schedule" : "Publish"}</Button></form>
          ) : null}
          {allowed("return_to_draft") ? (
            <form action={workflowAction}>{hidden}<Button type="submit" variant="secondary" name="action" value="return_to_draft">Return to draft</Button></form>
          ) : null}
          {allowed("unpublish") ? (
            <form action={workflowAction}>{hidden}
              <ConfirmButton label="Unpublish" title={`Unpublish this ${mod.singular}?`} message={<p>It is removed from the website straight away and becomes a draft. You can publish it again later.</p>} confirmLabel="Unpublish" name="action" value="unpublish" />
            </form>
          ) : null}
          {allowed("archive") ? (
            <form action={workflowAction}>{hidden}
              <ConfirmButton label="Archive" title={`Archive this ${mod.singular}?`} message={<p>It is taken off the website and kept for the record. You can return it to draft later.</p>} confirmLabel="Archive" name="action" value="archive" />
            </form>
          ) : null}
          {allowed("delete") ? (
            <form action={workflowAction}>{hidden}
              <ConfirmButton label="Delete" title={`Delete this ${mod.singular}?`} message={<p>It disappears from the website and from the lists. A Church Admin can restore it from the Deleted filter.</p>} confirmLabel={`Delete ${mod.singular}`} name="action" value="delete" />
            </form>
          ) : null}
          {allowed("restore") ? (
            <form action={workflowAction}>{hidden}<Button type="submit" name="action" value="restore">Restore as draft</Button></form>
          ) : null}
          {!isPublisher && item.status === "IN_REVIEW" ? <Text variant="small" tone="secondary">Submitted. A Church Admin will review and publish it.</Text> : null}
        </div>
      </Surface>

      {item.type === "TESTIMONY" ? (
        <section className={styles.section} aria-labelledby="perm-h">
          <Surface className={styles.card}>
            <Heading level={2} styleAs="h3" id="perm-h">Author&apos;s permission</Heading>
            <Text variant="small" measure>
              Status: <strong>{item.testimonyPermission === "GRANTED" ? "Granted" : item.testimonyPermission === "WITHDRAWN" ? "Withdrawn" : "Not recorded"}</strong>.
              {" "}Record permission only after the author has explicitly agreed to publication, in the form shown here. Withdrawing permission takes the testimony off the website immediately.
            </Text>
            {isPublisher && !item.deletedAt ? (
              <div className={styles.workflow}>
                {item.testimonyPermission !== "GRANTED" ? (
                  <form action={testimonyPermissionAction}>
                    <input type="hidden" name="id" value={item.id} />
                    <ConfirmButton label="Record permission granted" variant="secondary" title="Record the author's permission?" message={<p>Confirm that the author has explicitly agreed to publish this testimony, with the name shown (or anonymously).</p>} confirmLabel="Permission granted" name="permission" value="GRANTED" />
                  </form>
                ) : (
                  <form action={testimonyPermissionAction}>
                    <input type="hidden" name="id" value={item.id} />
                    <ConfirmButton label="Record permission withdrawn" variant="secondary" title="Record that permission was withdrawn?" message={<p>The testimony is unpublished immediately and cannot be published again until permission is granted.</p>} confirmLabel="Permission withdrawn" name="permission" value="WITHDRAWN" />
                  </form>
                )}
              </div>
            ) : !isPublisher ? (
              <Text variant="small" tone="secondary">Only a Church Admin records permission.</Text>
            ) : null}
          </Surface>
        </section>
      ) : null}

      <section className={styles.section} aria-label="Content">
        <ContentForm
          key={item.version}
          mod={formModule(mod)}
          id={item.id}
          version={item.version}
          values={toFormValues(item)}
          readOnly={!canEdit}
          readOnlyReason={canEdit ? undefined : readOnlyReason}
          isPublisher={isPublisher}
          media={media}
        />
      </section>
    </AdminShell>
  );
}
