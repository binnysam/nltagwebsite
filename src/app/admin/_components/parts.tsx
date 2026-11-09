import type { ReactNode } from "react";
import Link from "next/link";
import { Notice, StatusBadge, type BadgeTone } from "@/design-system/components";
import { Heading, Text } from "@/design-system/primitives";
import { displayStatus, type VisibilityFields } from "@/server/cms/rules";
import { formatKuwaitDateTime } from "@/lib/date";
import { messageFor } from "../_lib/staff";
import styles from "../admin.module.css";

const TONES: Record<ReturnType<typeof displayStatus>, BadgeTone> = {
  Draft: "neutral", "In review": "info", Scheduled: "info", Published: "success", Expired: "warning", Archived: "neutral", Deleted: "error",
};

/** Status in words with a matching tone ("Scheduled" = published with a future publish time). */
export function StatusTag({ item, now = new Date() }: { item: VisibilityFields; now?: Date }) {
  const label = displayStatus(item, now);
  return <StatusBadge tone={TONES[label]}>{label}</StatusBadge>;
}

export function PageHead({ title, lead, back, actions }: { title: string; lead?: string; back?: { href: string; label: string }; actions?: ReactNode }) {
  return (
    <div className={styles.pageHead}>
      <div className={styles.pageHeadText}>
        {back ? (
          <Link href={back.href} className={styles.eyebrowLink}>
            ← {back.label}
          </Link>
        ) : null}
        <Heading level={1} styleAs="h1">{title}</Heading>
        {lead ? <Text tone="secondary">{lead}</Text> : null}
      </div>
      {actions}
    </div>
  );
}

/** Titles in both languages; the Tamil one carries lang="ta" so the Tamil face and voice apply. */
export function Titles({ ta, en }: { ta: string; en: string }) {
  return (
    <span className={styles.titleStack}>
      {ta ? <span lang="ta">{ta}</span> : null}
      {en ? <span>{en}</span> : null}
      {!ta && !en ? <span>(untitled)</span> : null}
    </span>
  );
}

export const when = (d: Date | null | undefined) => (d ? formatKuwaitDateTime(d) : "—");

const DONE: Record<string, string> = {
  created: "Created as a draft.",
  submit: "Submitted for review. A Church Admin can now publish it.",
  publish: "Published.",
  unpublish: "Unpublished. It is a draft again and no longer on the site.",
  archive: "Archived. It is no longer on the site.",
  return_to_draft: "Returned to draft.",
  restore: "Restored as a draft.",
  deleted: "Deleted. A Church Admin can restore it from the Deleted filter.",
  permission: "Permission recorded.",
  revoked: "Role removed.",
  status: "Status updated.",
  removed: "Deleted permanently.",
  accepted: "Accepted. A testimony draft was created under Testimonies; it is not published.",
  added: "Added to the gallery as a draft.",
  saved: "Saved.",
};

/** Result banners for redirect-based actions. Only fixed keys are shown, never text from the URL. */
export function ResultNotice({ done, error }: { done?: string; error?: string }) {
  const err = messageFor(error);
  if (err) return <div className={styles.noticeWrap}><Notice tone="error" title="Not done"><p>{err}</p></Notice></div>;
  if (done && DONE[done]) return <div className={styles.noticeWrap}><Notice tone="success" title="Done"><p>{DONE[done]}</p></Notice></div>;
  return null;
}

export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
