import { notFound } from "next/navigation";
import { Notice } from "@/design-system/components";
import { Heading, Surface, Text } from "@/design-system/primitives";
import { Markdown } from "@/lib/markdown";
import { moduleByType } from "@/server/cms/registry";
import { CmsError, getItemForEdit } from "@/server/cms/service";
import { requireStaffPage } from "../../_lib/staff";
import { AdminShell } from "../../_components/AdminShell";
import { PageHead, StatusTag, when } from "../../_components/parts";
import styles from "../../admin.module.css";

export const metadata = { title: "Preview" };

/**
 * Protected preview: staff only (anonymous visitors get the sign-in page or 404), never cached or
 * indexed. Shows drafts exactly as text will render: Markdown through the same safe renderer.
 */
export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const ctx = await requireStaffPage();
  const item = await getItemForEdit(ctx, id).catch((e) => {
    if (e instanceof CmsError) notFound();
    throw e;
  });
  if (item.deletedAt) notFound();
  const mod = moduleByType(item.type);
  const ev = item.type === "EVENT" ? (item.detail as { startsAt?: Date; locationKind?: string; locationText?: string }) : null;

  return (
    <AdminShell ctx={ctx}>
      <PageHead title="Preview" back={{ href: `/admin/${mod.segment}/${item.id}`, label: "Back to editing" }} />
      <div className={styles.previewBanner}>
        <Notice tone="info" title="Preview — not public">
          <p>Only signed-in staff can see this page. The final page design comes with the public pages in a later phase.</p>
        </Notice>
      </div>
      <div className={styles.statusLine}>
        <StatusTag item={item} />
        {ev?.startsAt ? <span className={styles.meta}>Starts {when(ev.startsAt)}</span> : null}
        {ev?.locationKind ? <span className={styles.meta}>{ev.locationKind === "OTHER" ? ev.locationText : ev.locationKind === "NECK" ? "NECK" : ev.locationKind === "MEMBERS_HOMES" ? "Church members' homes" : "Place to be announced"}</span> : null}
      </div>
      <div className={`${styles.previewGrid} ${styles.section}`}>
        {(["ta", "en"] as const).map((l) => {
          const t = item.translations[l];
          return (
            <Surface key={l} padding={6} lang={l}>
              <article className={styles.prose} lang={l}>
                <Text variant="eyebrow" tone="secondary" lang="en">{l === "ta" ? "Tamil" : "English"}</Text>
                {t.title ? (
                  <>
                    <Heading level={2} styleAs="h1">{t.title}</Heading>
                    {t.summary ? <Text variant="body-l" tone="strong-secondary">{t.summary}</Text> : null}
                    {t.bodyMd ? <Markdown source={t.bodyMd} className={styles.prose} /> : null}
                  </>
                ) : (
                  <Text tone="secondary" lang="en">No {l === "ta" ? "Tamil" : "English"} version yet. This language will not be shown on the website.</Text>
                )}
              </article>
            </Surface>
          );
        })}
      </div>
    </AdminShell>
  );
}
