import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, ConfirmButton } from "@/design-system/components";
import { Heading, Surface, Text } from "@/design-system/primitives";
import { CmsError } from "@/server/cms/service";
import { getTestimonySubmission, publicFormsEnabled } from "@/server/forms/service";
import { displayNameFor } from "@/server/forms/validation";
import { can } from "@/server/policy/permissions";
import { submissionAcceptAction, submissionDeleteAction, submissionStatusAction } from "../../inbox-actions";
import { requireStaffPage } from "../../_lib/staff";
import { DISPLAY_LABEL, SUBMISSION_STATUS_LABEL } from "../../_lib/labels";
import { AdminShell } from "../../_components/AdminShell";
import { PageHead, ResultNotice, when, one } from "../../_components/parts";
import styles from "../../admin.module.css";

export const metadata = { title: "Testimony submission" };

export default async function SubmissionDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!publicFormsEnabled()) notFound();
  const ctx = await requireStaffPage("submission.read");
  const { id } = await params;
  const sp = await searchParams;
  let s;
  try {
    s = await getTestimonySubmission(ctx, id);
  } catch (e) {
    if (e instanceof CmsError) notFound();
    throw e;
  }
  const shownAs = displayNameFor(s.display, s.name);
  return (
    <AdminShell ctx={ctx}>
      <PageHead title={s.title} lead={`Received ${when(s.createdAt)} (Kuwait) · ${s.locale === "ta" ? "Tamil" : "English"} · ${SUBMISSION_STATUS_LABEL[s.status]}`} back={{ href: "/admin/testimony-submissions", label: "All submissions" }} />
      <ResultNotice done={one(sp.done)} error={one(sp.error)} />
      <Surface>
        <Heading level={2} styleAs="h3">Testimony</Heading>
        <Text lang={s.locale} className={styles.preserve}>{s.body}</Text>
        <Heading level={2} styleAs="h3">Name shown as</Heading>
        <Text>{DISPLAY_LABEL[s.display]}{shownAs ? `: ${shownAs}` : ""}</Text>
        {s.contact !== null ? (
          <>
            <Heading level={2} styleAs="h3">Contact (Church Admin only, never published)</Heading>
            <Text>{s.contact || "None given"}</Text>
          </>
        ) : null}
        <Heading level={2} styleAs="h3">Consent</Heading>
        <Text variant="small">Agreed to publication with the chosen name (edited for length and clarity) and confirmed no private details about others without permission. Consent version {s.consentVersion}.</Text>
      </Surface>
      <section className={styles.section} aria-labelledby="actions-h">
        <Heading level={2} styleAs="h3" id="actions-h">Decision</Heading>
        {s.status === "ACCEPTED" && s.contentItemId ? (
          <Text>Accepted. <Link href={`/admin/testimonies/${s.contentItemId}`}>Open the testimony draft</Link>.</Text>
        ) : null}
        <div className={styles.workflow}>
          {s.status === "NEW" && can(ctx.actor.principal, "submission.decide") ? (
            <>
              <form action={submissionAcceptAction}>
                <input type="hidden" name="id" value={s.id} />
                <Button type="submit">Accept as draft</Button>
              </form>
              <form action={submissionStatusAction}>
                <input type="hidden" name="id" value={s.id} />
                <input type="hidden" name="status" value="REJECTED" />
                <Button type="submit" variant="secondary">Do not accept</Button>
              </form>
            </>
          ) : null}
          {s.status !== "ARCHIVED" && s.status !== "NEW" && can(ctx.actor.principal, "submission.decide") ? (
            <form action={submissionStatusAction}>
              <input type="hidden" name="id" value={s.id} />
              <input type="hidden" name="status" value="ARCHIVED" />
              <Button type="submit" variant="secondary">Archive</Button>
            </form>
          ) : null}
          {can(ctx.actor.principal, "submission.contact") ? (
            <form action={submissionDeleteAction}>
              <input type="hidden" name="id" value={s.id} />
              <ConfirmButton label="Delete permanently" title="Delete this submission?" message={<p>The submission and its consent record are removed. A testimony draft already created from it stays.</p>} confirmLabel="Delete permanently" />
            </form>
          ) : null}
        </div>
      </section>
    </AdminShell>
  );
}
