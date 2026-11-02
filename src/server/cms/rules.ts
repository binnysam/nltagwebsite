import type { ContentStatus, ContentType, TestimonyPermission } from "../db/schema/content";
import { can, type Principal } from "../policy/permissions";

/**
 * Pure CMS rules: who may do what to an item, and what the public may see. No I/O, so they are
 * unit-tested exhaustively; the services call them inside every write.
 *
 *   Content Editor: create, edit DRAFT / IN_REVIEW items, submit for review, preview.
 *   Church Admin:   everything an editor can, plus publish, unpublish, archive, return to draft,
 *                   edit published items, delete and restore, record permissions.
 */
export type ContentAction =
  | "edit" | "submit" | "publish" | "unpublish" | "archive" | "return_to_draft" | "delete" | "restore";

export interface ItemState {
  type: ContentType;
  status: ContentStatus;
  deleted: boolean;
  testimonyPermission?: TestimonyPermission | null;
}

export function canPerform(principal: Principal, item: ItemState, action: ContentAction): boolean {
  if (!can(principal, "admin.access")) return false;
  const editor = can(principal, "content.draft.edit");
  const publisher = can(principal, "content.publish");
  if (item.deleted) return action === "restore" && publisher;
  switch (action) {
    case "edit":
      return editor && (item.status === "DRAFT" || item.status === "IN_REVIEW" || publisher);
    case "submit":
      return can(principal, "content.submit_for_review") && item.status === "DRAFT";
    case "publish":
      return publisher && item.status !== "PUBLISHED" && publishBlocker(item) === null;
    case "unpublish":
      return publisher && item.status === "PUBLISHED";
    case "archive":
      return publisher && item.status !== "ARCHIVED";
    case "return_to_draft":
      return publisher && (item.status === "IN_REVIEW" || item.status === "ARCHIVED");
    case "delete":
      return publisher;
    case "restore":
      return false;
  }
}

/** Reason an item cannot be published yet, or null. */
export function publishBlocker(item: Pick<ItemState, "type" | "testimonyPermission">): string | null {
  if (item.type === "TESTIMONY" && item.testimonyPermission !== "GRANTED") {
    return "Record the author's permission before publishing this testimony.";
  }
  return null;
}

export const STATUS_AFTER: Record<Exclude<ContentAction, "edit" | "delete">, ContentStatus> = {
  submit: "IN_REVIEW",
  publish: "PUBLISHED",
  unpublish: "DRAFT",
  archive: "ARCHIVED",
  return_to_draft: "DRAFT",
  restore: "DRAFT",
};

export interface VisibilityFields {
  type: ContentType;
  status: ContentStatus;
  deletedAt: Date | null;
  publishAt: Date | null;
  expiresAt: Date | null;
  testimonyPermission?: TestimonyPermission | null;
}

/**
 * The single public visibility rule. Public queries implement the same conditions in SQL;
 * an integration test checks they agree.
 */
export function isPubliclyVisible(item: VisibilityFields, now: Date): boolean {
  if (item.deletedAt) return false;
  if (item.status !== "PUBLISHED") return false;
  if (item.publishAt && item.publishAt.getTime() > now.getTime()) return false;
  if (item.expiresAt && item.expiresAt.getTime() <= now.getTime()) return false;
  if (item.type === "TESTIMONY" && item.testimonyPermission !== "GRANTED") return false;
  return true;
}

/** Label for lists: "Scheduled" is a published item whose time has not come. */
export function displayStatus(item: VisibilityFields, now: Date): "Draft" | "In review" | "Scheduled" | "Published" | "Expired" | "Archived" | "Deleted" {
  if (item.deletedAt) return "Deleted";
  switch (item.status) {
    case "DRAFT": return "Draft";
    case "IN_REVIEW": return "In review";
    case "ARCHIVED": return "Archived";
    case "PUBLISHED":
      if (item.publishAt && item.publishAt.getTime() > now.getTime()) return "Scheduled";
      if (item.expiresAt && item.expiresAt.getTime() <= now.getTime()) return "Expired";
      return "Published";
  }
}

/**
 * Deterministic daily verse: a scheduled verse wins; otherwise the same Kuwait date always picks
 * the same verse from the published list (sorted by id), so every visitor and every server
 * process sees the same card all day. FNV-1a over the date key.
 */
export function pickDailyVerse<T extends { id: string }>(dateKey: string, published: readonly T[], scheduledId?: string | null): T | null {
  if (scheduledId) {
    const s = published.find((v) => v.id === scheduledId);
    if (s) return s;
  }
  if (published.length === 0) return null;
  const sorted = [...published].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  let h = 0x811c9dc5;
  for (const ch of dateKey) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return sorted[h % sorted.length]!;
}
