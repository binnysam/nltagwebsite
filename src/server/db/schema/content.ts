import { boolean, date, index, int, mediumtext, mysqlEnum, mysqlTable, primaryKey, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { asciiBin, idColumn, timestamp3 } from "../columns";
import { user } from "./auth";

/**
 * CMS content (Phase 4c). Class-table inheritance:
 *   content_item          one row per piece of content (workflow, publication, soft delete)
 *   content_translation   one row per item and language (Tamil and English edited independently)
 *   *_detail              type-specific fields (event, sermon, ministry, testimony, verse)
 *
 * The regular weekly schedule is NOT stored here: it is the Gate 0 record in
 * src/content/schedule.ts. Only individually announced special meetings are CMS events.
 *
 * Text is Markdown only, validated on the server (no raw HTML is accepted or stored).
 * Ids are random UUIDs in ascii_bin columns.
 */

export const CONTENT_TYPES = ["PAGE", "ANNOUNCEMENT", "EVENT", "SERMON", "MINISTRY", "TESTIMONY", "VERSE"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

/** "Scheduled" is not a stored state: it is PUBLISHED with publish_at in the future. */
export const CONTENT_STATUSES = ["DRAFT", "IN_REVIEW", "PUBLISHED", "ARCHIVED"] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const CONTENT_LOCALES = ["ta", "en"] as const;
export type ContentLocale = (typeof CONTENT_LOCALES)[number];

/** UNLISTED: reachable by its address but left out of listings, navigation and the sitemap. */
export const VISIBILITIES = ["PUBLIC", "UNLISTED"] as const;

export const contentItem = mysqlTable(
  "content_item",
  {
    id: idColumn("id").primaryKey(),
    type: mysqlEnum("type", CONTENT_TYPES).notNull(),
    status: mysqlEnum("status", CONTENT_STATUSES).notNull().default("DRAFT"),
    /** Lower-case ASCII, shared by both languages (/ta/<slug>, /en/<slug>). Required for pages. */
    slug: asciiBin("slug", { length: 120 }),
    visibility: mysqlEnum("visibility", VISIBILITIES).notNull().default("PUBLIC"),
    featured: boolean("featured").notNull().default(false),
    /** Optional scheduled publication (UTC). Null = visible as soon as published. */
    publishAt: timestamp3("publish_at"),
    /** Optional expiry (UTC), mainly for announcements. */
    expiresAt: timestamp3("expires_at"),
    /** First time the item was published (kept when unpublished and republished). */
    firstPublishedAt: timestamp3("first_published_at"),
    publishedAt: timestamp3("published_at"),
    submittedAt: timestamp3("submitted_at"),
    /** Optimistic concurrency: every update must name the version it edited. */
    version: int("version", { unsigned: true }).notNull().default(1),
    createdByUserId: idColumn("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    updatedByUserId: idColumn("updated_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp3("created_at").notNull(),
    updatedAt: timestamp3("updated_at").notNull(),
    /** Soft delete (Church Admin). Deleted items never appear anywhere except the restore list. */
    deletedAt: timestamp3("deleted_at"),
    deletedByUserId: idColumn("deleted_by_user_id").references(() => user.id, { onDelete: "set null" }),
  },
  (t) => [
    uniqueIndex("content_item_type_slug_uq").on(t.type, t.slug),
    index("content_item_listing_idx").on(t.type, t.deletedAt, t.status, t.publishAt),
    index("content_item_updated_idx").on(t.updatedAt),
  ],
);

export const TRANSLATION_STATES = ["EMPTY", "DRAFT", "READY"] as const;

export const contentTranslation = mysqlTable(
  "content_translation",
  {
    itemId: idColumn("item_id")
      .notNull()
      .references(() => contentItem.id, { onDelete: "cascade" }),
    locale: mysqlEnum("locale", CONTENT_LOCALES).notNull(),
    title: varchar("title", { length: 200 }).notNull().default(""),
    summary: varchar("summary", { length: 500 }).notNull().default(""),
    /** Markdown (validated: no HTML). Rendered to React elements, never to an HTML string. */
    bodyMd: mediumtext("body_md").notNull(),
    seoTitle: varchar("seo_title", { length: 120 }).notNull().default(""),
    seoDescription: varchar("seo_description", { length: 320 }).notNull().default(""),
    /** Editor's own marker; public pages show a language only when it has a title. */
    state: mysqlEnum("state", TRANSLATION_STATES).notNull().default("EMPTY"),
    updatedAt: timestamp3("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.locale], name: "content_translation_pk" })],
);

export const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

/**
 * Uploaded images (thumbnails, ministry images). The bytes live as files in the persistent media
 * folder outside the deployment (`src/server/storage/media-store.ts`, owner decision 2 Nov 2026);
 * this row holds the metadata, the file's key and its SHA-256. Images only (no SVG), checked by
 * their bytes, 2 MB each. Served only to staff in 4c.
 */
export const mediaAsset = mysqlTable(
  "media_asset",
  {
    id: idColumn("id").primaryKey(),
    mimeType: mysqlEnum("mime_type", MEDIA_TYPES).notNull(),
    byteSize: int("byte_size", { unsigned: true }).notNull(),
    sha256: asciiBin("sha256", { length: 64 }).notNull(),
    altTa: varchar("alt_ta", { length: 300 }).notNull().default(""),
    altEn: varchar("alt_en", { length: 300 }).notNull().default(""),
    storageKey: asciiBin("storage_key", { length: 64 }).notNull(),
    createdByUserId: idColumn("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp3("created_at").notNull(),
    deletedAt: timestamp3("deleted_at"),
  },
  (t) => [index("media_asset_created_idx").on(t.createdAt), index("media_asset_sha_idx").on(t.sha256)],
);

/** NECK and members' homes never carry an address; OTHER needs a short location name. */
export const EVENT_LOCATIONS = ["NECK", "MEMBERS_HOMES", "OTHER", "TO_BE_ANNOUNCED"] as const;
export type EventLocation = (typeof EVENT_LOCATIONS)[number];

/** Special meetings (individually announced). Times stored in UTC, entered in Kuwait time. */
export const eventDetail = mysqlTable(
  "event_detail",
  {
    itemId: idColumn("item_id")
      .primaryKey()
      .references(() => contentItem.id, { onDelete: "cascade" }),
    startsAt: timestamp3("starts_at").notNull(),
    endsAt: timestamp3("ends_at"),
    locationKind: mysqlEnum("location_kind", EVENT_LOCATIONS).notNull().default("TO_BE_ANNOUNCED"),
    locationText: varchar("location_text", { length: 200 }).notNull().default(""),
  },
  (t) => [index("event_detail_starts_idx").on(t.startsAt)],
);

export const sermonDetail = mysqlTable("sermon_detail", {
  itemId: idColumn("item_id")
    .primaryKey()
    .references(() => contentItem.id, { onDelete: "cascade" }),
  speaker: varchar("speaker", { length: 200 }).notNull().default(""),
  bibleReference: varchar("bible_reference", { length: 120 }).notNull().default(""),
  sermonDate: date("sermon_date", { mode: "string" }),
  /** Link only (YouTube etc.). Media is never downloaded or re-hosted. */
  videoUrl: varchar("video_url", { length: 500 }).notNull().default(""),
  thumbnailAssetId: idColumn("thumbnail_asset_id").references(() => mediaAsset.id, { onDelete: "set null" }),
});

export const ministryDetail = mysqlTable("ministry_detail", {
  itemId: idColumn("item_id")
    .primaryKey()
    .references(() => contentItem.id, { onDelete: "cascade" }),
  imageAssetId: idColumn("image_asset_id").references(() => mediaAsset.id, { onDelete: "set null" }),
  /** Public contact line, shown only once a Church Admin marks it approved. */
  contactText: varchar("contact_text", { length: 300 }).notNull().default(""),
  contactApproved: boolean("contact_approved").notNull().default(false),
});

export const TESTIMONY_PERMISSIONS = ["NOT_RECORDED", "GRANTED", "WITHDRAWN"] as const;
export type TestimonyPermission = (typeof TESTIMONY_PERMISSIONS)[number];

/** A testimony can only be published while its permission is GRANTED (recorded by a Church Admin). */
export const testimonyDetail = mysqlTable("testimony_detail", {
  itemId: idColumn("item_id")
    .primaryKey()
    .references(() => contentItem.id, { onDelete: "cascade" }),
  authorDisplayName: varchar("author_display_name", { length: 120 }).notNull().default(""),
  anonymous: boolean("anonymous").notNull().default(true),
  permissionStatus: mysqlEnum("permission_status", TESTIMONY_PERMISSIONS).notNull().default("NOT_RECORDED"),
  permissionRecordedAt: timestamp3("permission_recorded_at"),
  permissionRecordedByUserId: idColumn("permission_recorded_by_user_id").references(() => user.id, { onDelete: "set null" }),
});

export const BIBLE_PERMISSIONS = ["NOT_VERIFIED", "VERIFIED"] as const;

/**
 * Bible translations and their reproduction permission. Seeded by migration 0001 with
 * NOT_VERIFIED. Verse text is never served publicly, and downloads stay off, until a
 * Church Admin records the verified permission here.
 */
export const bibleTranslation = mysqlTable("bible_translation", {
  id: asciiBin("id", { length: 32 }).primaryKey(),
  locale: mysqlEnum("locale", CONTENT_LOCALES).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  publisher: varchar("publisher", { length: 200 }).notNull(),
  /** Exact credit line required by the publisher's permission terms. Empty until supplied. */
  creditLine: varchar("credit_line", { length: 300 }).notNull().default(""),
  permissionStatus: mysqlEnum("permission_status", BIBLE_PERMISSIONS).notNull().default("NOT_VERIFIED"),
  /** Where the permission is documented (letter or email reference). No personal data. */
  permissionReference: varchar("permission_reference", { length: 300 }).notNull().default(""),
  permissionVerifiedAt: timestamp3("permission_verified_at"),
  permissionVerifiedByUserId: idColumn("permission_verified_by_user_id").references(() => user.id, { onDelete: "set null" }),
  downloadsAllowed: boolean("downloads_allowed").notNull().default(false),
  updatedAt: timestamp3("updated_at").notNull(),
});

export const VERSE_CARD_VARIANTS = ["compact", "landscape", "square", "portrait"] as const;
export const VERSE_PRESETS = ["vaigarai", "manal", "kadal", "andhi", "thalir"] as const;

export const verseDetail = mysqlTable("verse_detail", {
  itemId: idColumn("item_id")
    .primaryKey()
    .references(() => contentItem.id, { onDelete: "cascade" }),
  cardVariant: mysqlEnum("card_variant", VERSE_CARD_VARIANTS).notNull().default("compact"),
  preset: mysqlEnum("preset", VERSE_PRESETS).notNull().default("vaigarai"),
});

export const verseText = mysqlTable(
  "verse_text",
  {
    itemId: idColumn("item_id")
      .notNull()
      .references(() => contentItem.id, { onDelete: "cascade" }),
    translationId: asciiBin("translation_id", { length: 32 })
      .notNull()
      .references(() => bibleTranslation.id),
    reference: varchar("reference", { length: 120 }).notNull().default(""),
    text: varchar("text", { length: 2000 }).notNull().default(""),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.translationId], name: "verse_text_pk" })],
);

/** One verse per Kuwait calendar day (YYYY-MM-DD). Days without a row use deterministic selection. */
export const verseSchedule = mysqlTable(
  "verse_schedule",
  {
    dateKey: asciiBin("date_key", { length: 10 }).primaryKey(),
    itemId: idColumn("item_id")
      .notNull()
      .references(() => contentItem.id, { onDelete: "cascade" }),
    scheduledByUserId: idColumn("scheduled_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp3("created_at").notNull(),
  },
  (t) => [index("verse_schedule_item_idx").on(t.itemId)],
);
