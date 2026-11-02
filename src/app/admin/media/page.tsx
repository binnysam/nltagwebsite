import { ConfirmButton } from "@/design-system/components";
import { Heading, Surface, Text } from "@/design-system/primitives";
import { can } from "@/server/policy/permissions";
import { listMedia } from "@/server/cms/service";
import { deleteMediaAction } from "../actions";
import { requireStaffPage } from "../_lib/staff";
import { AdminShell } from "../_components/AdminShell";
import { MediaUploadForm } from "../_components/forms.client";
import { PageHead, ResultNotice, when, one } from "../_components/parts";
import styles from "../admin.module.css";

export const metadata = { title: "Media" };

export default async function MediaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireStaffPage();
  const sp = await searchParams;
  const items = await listMedia(ctx);
  const canDelete = can(ctx.actor.principal, "content.publish");
  return (
    <AdminShell ctx={ctx}>
      <PageHead title="Media" lead="Images for sermon thumbnails and ministries. Stored in the website's database so they survive deployments." />
      <ResultNotice done={one(sp.done)} error={one(sp.error)} />
      {can(ctx.actor.principal, "media.upload") ? (
        <Surface>
          <MediaUploadForm />
        </Surface>
      ) : null}
      <section className={styles.section} aria-labelledby="lib-h">
        <Heading level={2} styleAs="h3" id="lib-h">Library</Heading>
        {items.length === 0 ? (
          <Surface><Text>No images yet.</Text></Surface>
        ) : (
          <ul className={styles.mediaGrid}>
            {items.map((m) => (
              <li key={m.id}>
                <Surface padding={4} className={styles.card}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- private, staff-only bytes; no public optimisation */}
                  <img src={`/admin/media/${m.id}`} alt={m.altEn || m.altTa || ""} className={styles.thumb} loading="lazy" />
                  <Text variant="small">{m.altEn || <span lang="ta">{m.altTa}</span> || "No description"}</Text>
                  <span className={styles.meta}>{Math.round(m.byteSize / 1024)} KB · {when(m.createdAt)}</span>
                  {canDelete ? (
                    <form action={deleteMediaAction}>
                      <input type="hidden" name="id" value={m.id} />
                      <ConfirmButton label="Delete" compact title="Delete this image?" message={<p>Sermons and ministries that use it will show no image. This cannot be undone.</p>} confirmLabel="Delete image" />
                    </form>
                  ) : null}
                </Surface>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AdminShell>
  );
}
