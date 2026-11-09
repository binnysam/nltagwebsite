import { notFound } from "next/navigation";
import { Button, ConfirmButton, SelectField, StatusBadge, TextField } from "@/design-system/components";
import { Heading, Surface, Text } from "@/design-system/primitives";
import { PHOTO_PERMISSIONS } from "@/server/db/schema";
import { publicFormsEnabled } from "@/server/forms/service";
import { libraryImagesNotInGallery, listGalleryForStaff } from "@/server/gallery/service";
import { can } from "@/server/policy/permissions";
import { galleryAddAction, galleryPermissionAction, galleryPublishAction, galleryUpdateAction } from "../inbox-actions";
import { requireStaffPage } from "../_lib/staff";
import { PHOTO_PERMISSION_LABEL } from "../_lib/labels";
import { AdminShell } from "../_components/AdminShell";
import { InboxPager } from "../_components/InboxPager";
import { PageHead, ResultNotice, one } from "../_components/parts";
import styles from "../admin.module.css";

export const metadata = { title: "Gallery" };

/**
 * Public gallery management. Content Editors and Church Admins add library images and write
 * captions; only a Church Admin records the photo permission and publishes. The public site shows
 * resized copies without camera or location data, never the original.
 */
export default async function GalleryAdmin({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!publicFormsEnabled()) notFound();
  const ctx = await requireStaffPage("media.upload");
  const sp = await searchParams;
  const data = await listGalleryForStaff(ctx, Number(one(sp.page) ?? 1));
  const library = await libraryImagesNotInGallery(ctx);
  const isAdmin = can(ctx.actor.principal, "gallery.publish");
  return (
    <AdminShell ctx={ctx}>
      <PageHead title="Gallery" lead="Photos on the public Gallery page. Upload images under Media first. A photo appears on the site only after a Church Admin records where the permission to publish it is documented, and publishes it." />
      <ResultNotice done={one(sp.done)} error={one(sp.error)} />
      <section className={styles.section} aria-labelledby="add-h">
        <Heading level={2} styleAs="h3" id="add-h">Add a library image</Heading>
        {library.length === 0 ? (
          <Surface><Text>Every library image is already in the gallery. Upload new images under Media.</Text></Surface>
        ) : (
          <Surface>
            <form action={galleryAddAction} className={styles.filters}>
              <SelectField id="mediaAssetId" name="mediaAssetId" label="Image" options={library.map((m) => ({ value: m.id, label: m.altEn || m.id.slice(0, 8) }))} />
              <TextField id="captionEn" name="captionEn" label="Caption (English)" maxLength={300} />
              <TextField id="captionTa" name="captionTa" label="Caption (Tamil)" lang="ta" maxLength={300} />
              <Button type="submit" variant="secondary">Add as draft</Button>
            </form>
          </Surface>
        )}
      </section>
      <section className={styles.section} aria-labelledby="photos-h">
        <Heading level={2} styleAs="h3" id="photos-h">Photos ({data.total})</Heading>
        {data.rows.length === 0 ? (
          <Surface><Text>No photos in the gallery yet.</Text></Surface>
        ) : (
          <ul className={styles.mediaGrid}>
            {data.rows.map((p) => (
              <li key={p.id}>
                <Surface padding={4} className={styles.card}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- private, staff-only original */}
                  <img src={`/admin/media/${p.mediaAssetId}`} alt={p.captionEn || p.captionTa || ""} className={styles.thumb} loading="lazy" />
                  <div className={styles.workflow}>
                    <StatusBadge tone={p.status === "PUBLISHED" ? "success" : "neutral"}>{p.status === "PUBLISHED" ? "Published" : p.status === "ARCHIVED" ? "Archived" : "Draft"}</StatusBadge>
                    <span className={styles.meta}>Permission: {PHOTO_PERMISSION_LABEL[p.permission]}{p.mediaDeleted ? " · library image deleted" : ""}</span>
                  </div>
                  <form action={galleryUpdateAction} className={styles.card}>
                    <input type="hidden" name="id" value={p.id} />
                    <TextField id={`en-${p.id}`} name="captionEn" label="Caption (English)" defaultValue={p.captionEn} maxLength={300} />
                    <TextField id={`ta-${p.id}`} name="captionTa" label="Caption (Tamil)" lang="ta" defaultValue={p.captionTa} maxLength={300} />
                    <TextField id={`pos-${p.id}`} name="position" label="Order (lower first)" type="number" inputMode="numeric" defaultValue={String(p.position)} />
                    <Button type="submit" variant="secondary">Save captions</Button>
                  </form>
                  {isAdmin ? (
                    <>
                      <form action={galleryPermissionAction} className={styles.card}>
                        <input type="hidden" name="id" value={p.id} />
                        <SelectField id={`perm-${p.id}`} name="permission" label="Photo permission" options={PHOTO_PERMISSIONS.map((v) => ({ value: v, label: PHOTO_PERMISSION_LABEL[v] }))} defaultValue={p.permission} />
                        <TextField id={`note-${p.id}`} name="permissionNote" label="Where the permission is documented" hint="For example: consent forms on file. No names." defaultValue={p.permissionNote} maxLength={300} />
                        <Button type="submit" variant="secondary">Record permission</Button>
                      </form>
                      <div className={styles.workflow}>
                        <form action={galleryPublishAction}>
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="op" value={p.status === "PUBLISHED" ? "unpublish" : "publish"} />
                          <Button type="submit">{p.status === "PUBLISHED" ? "Unpublish" : "Publish"}</Button>
                        </form>
                        <form action={galleryPublishAction}>
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="op" value="remove" />
                          <ConfirmButton label="Remove from gallery" compact title="Remove this photo from the gallery?" message={<p>It leaves the public gallery and its resized copies are deleted. The image stays in the Media library.</p>} confirmLabel="Remove" />
                        </form>
                      </div>
                    </>
                  ) : null}
                </Surface>
              </li>
            ))}
          </ul>
        )}
        <InboxPager base="/admin/gallery" page={data.page} total={data.total} pageSize={data.pageSize} />
      </section>
    </AdminShell>
  );
}
