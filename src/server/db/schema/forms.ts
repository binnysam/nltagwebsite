import { boolean, index, int, mediumtext, mysqlEnum, mysqlTable, text, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { asciiBin, idColumn, timestamp3 } from "../columns";
import { user } from "./auth";
import { contentItem, mediaAsset } from "./content";

/**
 * Public submissions (website completion, Nov 2026; migration 0004_forms_gallery).
 *
 * Nothing here is ever read by a public route. Every read and write goes through
 * src/server/forms/service.ts, which checks the permission matrix (prayer: Church Admin and Prayer
 * Team only; contact: Church Admin only; testimony submissions: Church Admin, and Content Editors
 * without the submitter's contact details).
 *
 * `content_hash` is an HMAC of the normalised text (duplicate refusal within 24 h); it is not
 * reversible and is never shown. Audit rows hold ids and action names only, never this text.
 */

export const SUBMISSION_LOCALES = ["ta", "en"] as const;

/**
 * Prayer requests. Name, contact and request text are encrypted at rest (AES-256-GCM, key
 * NLTAG_DATA_KEY, src/server/forms/crypto.ts): a database dump or backup does not reveal them.
 * Kept until a Church Admin or Prayer Team member deletes them (owner decision: manual deletion);
 * deletion removes the row.
 */
export const PRAYER_STATUSES = ["NEW", "READ", "PRAYED", "ARCHIVED"] as const;
export type PrayerStatus = (typeof PRAYER_STATUSES)[number];

export const prayerRequest = mysqlTable(
  "prayer_request",
  {
    id: idColumn("id").primaryKey(),
    createdAt: timestamp3("created_at").notNull(),
    locale: mysqlEnum("locale", SUBMISSION_LOCALES).notNull(),
    /** Encrypted (base64 "v1.<iv>.<tag>.<ciphertext>"); empty when not given. */
    nameEnc: text("name_enc").notNull(),
    contactEnc: text("contact_enc").notNull(),
    bodyEnc: mediumtext("body_enc").notNull(),
    contactRequested: boolean("contact_requested").notNull().default(false),
    status: mysqlEnum("status", PRAYER_STATUSES).notNull().default("NEW"),
    statusChangedAt: timestamp3("status_changed_at"),
    statusChangedByUserId: idColumn("status_changed_by_user_id").references(() => user.id, { onDelete: "set null" }),
    consentVersion: asciiBin("consent_version", { length: 16 }).notNull(),
    contentHash: asciiBin("content_hash", { length: 64 }).notNull(),
    notifiedAt: timestamp3("notified_at"),
  },
  (t) => [index("prayer_request_created_idx").on(t.createdAt), index("prayer_request_status_idx").on(t.status, t.createdAt), index("prayer_request_hash_idx").on(t.contentHash, t.createdAt)],
);

/** Contact form: Name, Email, optional Phone, Subject, Message (owner-approved fields). */
export const CONTACT_STATUSES = ["NEW", "REPLIED", "ARCHIVED"] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export const contactMessage = mysqlTable(
  "contact_message",
  {
    id: idColumn("id").primaryKey(),
    createdAt: timestamp3("created_at").notNull(),
    locale: mysqlEnum("locale", SUBMISSION_LOCALES).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    email: varchar("email", { length: 254 }).notNull(),
    phone: varchar("phone", { length: 40 }).notNull().default(""),
    subject: varchar("subject", { length: 200 }).notNull(),
    message: text("message").notNull(),
    status: mysqlEnum("status", CONTACT_STATUSES).notNull().default("NEW"),
    handledAt: timestamp3("handled_at"),
    handledByUserId: idColumn("handled_by_user_id").references(() => user.id, { onDelete: "set null" }),
    contentHash: asciiBin("content_hash", { length: 64 }).notNull(),
    notifiedAt: timestamp3("notified_at"),
  },
  (t) => [index("contact_message_created_idx").on(t.createdAt), index("contact_message_status_idx").on(t.status, t.createdAt), index("contact_message_hash_idx").on(t.contentHash, t.createdAt)],
);

/**
 * Testimony submissions from the public. Never published directly: "Accept as draft" creates a
 * TESTIMONY draft in the CMS (normal workflow, Church Admin publishes) with permission recorded as
 * granted by the submitter. Contact details are visible to Church Admins only.
 */
export const TESTIMONY_DISPLAY = ["FULL_NAME", "FIRST_NAME", "ANONYMOUS"] as const;
export type TestimonyDisplay = (typeof TESTIMONY_DISPLAY)[number];
export const TESTIMONY_SUBMISSION_STATUSES = ["NEW", "ACCEPTED", "REJECTED", "ARCHIVED"] as const;
export type TestimonySubmissionStatus = (typeof TESTIMONY_SUBMISSION_STATUSES)[number];

export const testimonySubmission = mysqlTable(
  "testimony_submission",
  {
    id: idColumn("id").primaryKey(),
    createdAt: timestamp3("created_at").notNull(),
    locale: mysqlEnum("locale", SUBMISSION_LOCALES).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    body: text("body").notNull(),
    display: mysqlEnum("display", TESTIMONY_DISPLAY).notNull(),
    name: varchar("name", { length: 120 }).notNull().default(""),
    contact: varchar("contact", { length: 254 }).notNull().default(""),
    consentVersion: asciiBin("consent_version", { length: 16 }).notNull(),
    status: mysqlEnum("status", TESTIMONY_SUBMISSION_STATUSES).notNull().default("NEW"),
    contentItemId: idColumn("content_item_id").references(() => contentItem.id, { onDelete: "set null" }),
    decidedAt: timestamp3("decided_at"),
    decidedByUserId: idColumn("decided_by_user_id").references(() => user.id, { onDelete: "set null" }),
    contentHash: asciiBin("content_hash", { length: 64 }).notNull(),
    notifiedAt: timestamp3("notified_at"),
  },
  (t) => [index("testimony_submission_created_idx").on(t.createdAt), index("testimony_submission_status_idx").on(t.status, t.createdAt), index("testimony_submission_hash_idx").on(t.contentHash, t.createdAt)],
);

/**
 * Public image gallery. A photo is an uploaded media asset plus captions; it is public only when
 * a Church Admin has recorded the photo permission AND published it. Resized WebP variants
 * (metadata stripped, so no camera or GPS data) are written to the media folder on publish; the
 * original stays private. `variants` is JSON text mapping width → SHA-256 of that file.
 */
export const GALLERY_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type GalleryStatus = (typeof GALLERY_STATUSES)[number];
export const PHOTO_PERMISSIONS = ["NOT_RECORDED", "GRANTED", "WITHDRAWN"] as const;
export type PhotoPermission = (typeof PHOTO_PERMISSIONS)[number];

export const galleryPhoto = mysqlTable(
  "gallery_photo",
  {
    id: idColumn("id").primaryKey(),
    mediaAssetId: idColumn("media_asset_id")
      .notNull()
      .references(() => mediaAsset.id, { onDelete: "cascade" }),
    captionTa: varchar("caption_ta", { length: 300 }).notNull().default(""),
    captionEn: varchar("caption_en", { length: 300 }).notNull().default(""),
    status: mysqlEnum("status", GALLERY_STATUSES).notNull().default("DRAFT"),
    permission: mysqlEnum("permission", PHOTO_PERMISSIONS).notNull().default("NOT_RECORDED"),
    /** Where the permission is documented (no personal data), e.g. "consent forms on file". */
    permissionNote: varchar("permission_note", { length: 300 }).notNull().default(""),
    permissionRecordedAt: timestamp3("permission_recorded_at"),
    permissionRecordedByUserId: idColumn("permission_recorded_by_user_id").references(() => user.id, { onDelete: "set null" }),
    /** JSON text {"480": sha256, …}; ascii_bin like every other hash column (not MariaDB JSON, which is utf8mb4_bin). */
    variants: asciiBin("variants", { length: 300 }),
    width: int("width", { unsigned: true }),
    height: int("height", { unsigned: true }),
    position: int("position").notNull().default(0),
    publishedAt: timestamp3("published_at"),
    createdByUserId: idColumn("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp3("created_at").notNull(),
    updatedAt: timestamp3("updated_at").notNull(),
    version: int("version", { unsigned: true }).notNull().default(1),
  },
  (t) => [uniqueIndex("gallery_photo_media_uq").on(t.mediaAssetId), index("gallery_photo_public_idx").on(t.status, t.permission, t.publishedAt)],
);
