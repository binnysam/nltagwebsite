import { notFound } from "next/navigation";
import { can } from "@/server/policy/permissions";
import { moduleBySegment } from "@/server/cms/registry";
import { requireStaffPage } from "../../_lib/staff";
import { emptyValues, formModule, mediaChoices } from "../../_lib/form-values";
import { AdminShell } from "../../_components/AdminShell";
import { ContentForm } from "../../_components/ContentForm.client";
import { PageHead } from "../../_components/parts";

export async function generateMetadata({ params }: { params: Promise<{ module: string }> }) {
  const mod = moduleBySegment((await params).module);
  return { title: mod ? `New ${mod.singular}` : "Not found" };
}

export default async function NewItemPage({ params }: { params: Promise<{ module: string }> }) {
  const mod = moduleBySegment((await params).module);
  if (!mod) notFound();
  const ctx = await requireStaffPage("content.draft.edit");
  const media = mod.type === "SERMON" || mod.type === "MINISTRY" ? await mediaChoices(ctx) : [];
  return (
    <AdminShell ctx={ctx}>
      <PageHead title={`New ${mod.singular}`} lead="Fill in Tamil, English or both. Each language is published only when it has a title." back={{ href: `/admin/${mod.segment}`, label: mod.label }} />
      <ContentForm mod={formModule(mod)} values={emptyValues()} readOnly={false} isPublisher={can(ctx.actor.principal, "content.publish")} media={media} />
    </AdminShell>
  );
}
