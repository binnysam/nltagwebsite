import { notFound } from "next/navigation";
import { ButtonLink, SelectField, TextField, Button } from "@/design-system/components";
import { Heading, Surface, Text } from "@/design-system/primitives";
import { CONTENT_STATUSES, type ContentStatus } from "@/server/db/schema";
import { can } from "@/server/policy/permissions";
import { moduleBySegment } from "@/server/cms/registry";
import { listItems } from "@/server/cms/service";
import { requireStaffPage } from "../_lib/staff";
import { AdminShell } from "../_components/AdminShell";
import { ContentList } from "../_components/ContentList";
import { PageHead, ResultNotice, one } from "../_components/parts";
import { RegularSchedule } from "../_components/RegularSchedule";
import { VersePanels } from "../_components/VersePanels";
import styles from "../admin.module.css";

type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Promise<{ module: string }> }) {
  return { title: moduleBySegment((await params).module)?.label ?? "Not found" };
}

const STATUS_LABEL: Record<ContentStatus, string> = { DRAFT: "Drafts", IN_REVIEW: "In review", PUBLISHED: "Published and scheduled", ARCHIVED: "Archived" };

export default async function ModuleListPage({ params, searchParams }: { params: Promise<{ module: string }>; searchParams: Search }) {
  const mod = moduleBySegment((await params).module);
  if (!mod) notFound();
  const ctx = await requireStaffPage();
  const sp = await searchParams;
  const statusParam = one(sp.status);
  const isAdmin = can(ctx.actor.principal, "content.publish");
  const status = (CONTENT_STATUSES as readonly string[]).includes(statusParam ?? "") ? (statusParam as ContentStatus) : statusParam === "DELETED" && isAdmin ? "DELETED" : null;
  const q = (one(sp.q) ?? "").slice(0, 100);
  const rows = await listItems(ctx, mod.type, { status, q });
  const filtered = Boolean(status || q);

  const statusOptions = [
    { value: "", label: "All (not deleted)" },
    ...CONTENT_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] })),
    ...(isAdmin ? [{ value: "DELETED", label: "Deleted" }] : []),
  ];

  return (
    <AdminShell ctx={ctx}>
      <PageHead title={mod.label} lead={mod.description} actions={<ButtonLink href={`/admin/${mod.segment}/new`}>New {mod.singular}</ButtonLink>} />
      <ResultNotice done={one(sp.done)} error={one(sp.error)} />

      {mod.type === "EVENT" ? <RegularSchedule /> : null}
      {mod.type === "VERSE" ? <VersePanels ctx={ctx} /> : null}

      <section className={styles.section} aria-labelledby="list-h">
        <Heading level={2} styleAs="h3" id="list-h">{mod.type === "EVENT" ? "Special meetings" : `All ${mod.label.toLowerCase()}`}</Heading>
        <form className={styles.filters} method="get" role="search" aria-label={`Filter ${mod.label.toLowerCase()}`}>
          <TextField id="q" name="q" type="search" label="Search titles" defaultValue={q} />
          <SelectField id="status" name="status" label="Status" options={statusOptions} defaultValue={status ?? ""} />
          <Button type="submit" variant="secondary">Apply filters</Button>
        </form>
        {rows.length ? (
          <ContentList rows={rows} caption={`${mod.label} list`} />
        ) : (
          <Surface className={styles.empty}>
            <Text>{filtered ? "Nothing matches these filters." : `No ${mod.label.toLowerCase()} yet.`}</Text>
            {filtered ? <ButtonLink href={`/admin/${mod.segment}`} variant="secondary">Clear filters</ButtonLink> : <ButtonLink href={`/admin/${mod.segment}/new`} variant="secondary">New {mod.singular}</ButtonLink>}
          </Surface>
        )}
      </section>
    </AdminShell>
  );
}
