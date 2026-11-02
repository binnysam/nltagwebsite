import "server-only";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { kuwaitDateKey } from "@/lib/date";
import { getDb } from "../db/client";
import {
  bibleTranslation, contentItem, contentTranslation, eventDetail, ministryDetail, sermonDetail, testimonyDetail,
  verseDetail, verseSchedule, verseText, type ContentLocale, type ContentType, type EventLocation,
} from "../db/schema";
import { PUBLIC_CONTENT_TAG } from "./cache";
import { isPubliclyVisible, pickDailyVerse } from "./rules";

/**
 * Published content for the public website (consumed by later phases). Rules:
 *   - only PUBLISHED, not deleted, inside the publish/expiry window (Kuwait "now" checked on read)
 *   - testimonies only with GRANTED permission
 *   - a language appears only if it has a title in that language
 *   - DTOs carry public fields only: no author ids, permission records, unapproved contacts
 *   - Bible verse text only when the translation's permission is VERIFIED
 * Results are cached under one tag that every CMS write clears; the time window is applied after
 * the cache so scheduled and expiring items switch at the right minute.
 */

export interface PublicItem {
  id: string;
  type: ContentType;
  slug: string | null;
  featured: boolean;
  unlisted: boolean;
  publishedAt: Date | null;
  title: string;
  summary: string;
  bodyMd: string;
  seoTitle: string;
  seoDescription: string;
}

interface Row {
  id: string; type: ContentType; slug: string | null; featured: boolean; visibility: "PUBLIC" | "UNLISTED";
  publishAt: Date | null; expiresAt: Date | null; publishedAt: Date | null; testimonyPermission: string | null;
  locale: ContentLocale; title: string; summary: string; bodyMd: string; seoTitle: string; seoDescription: string;
}

/** Uncached query (tests call this directly). */
export async function queryPublishedRows(type: ContentType): Promise<Row[]> {
  const rows = await getDb()
    .select({
      id: contentItem.id, type: contentItem.type, slug: contentItem.slug, featured: contentItem.featured, visibility: contentItem.visibility,
      publishAt: contentItem.publishAt, expiresAt: contentItem.expiresAt, publishedAt: contentItem.publishedAt,
      testimonyPermission: testimonyDetail.permissionStatus,
      locale: contentTranslation.locale, title: contentTranslation.title, summary: contentTranslation.summary, bodyMd: contentTranslation.bodyMd,
      seoTitle: contentTranslation.seoTitle, seoDescription: contentTranslation.seoDescription,
    })
    .from(contentItem)
    .innerJoin(contentTranslation, eq(contentTranslation.itemId, contentItem.id))
    .leftJoin(testimonyDetail, eq(testimonyDetail.itemId, contentItem.id))
    .where(
      and(
        eq(contentItem.type, type),
        eq(contentItem.status, "PUBLISHED"),
        isNull(contentItem.deletedAt),
        sql`${contentTranslation.title} <> ''`,
        type === "TESTIMONY" ? eq(testimonyDetail.permissionStatus, "GRANTED") : undefined,
      ),
    );
  return rows.map((r) => ({ ...r, publishAt: r.publishAt, expiresAt: r.expiresAt }));
}

/** Cache revalidation window (seconds). Any CMS write that touches public output expires the tag at once. */
export const PUBLIC_REVALIDATE_SECONDS = 300;

/**
 * Wraps a query in the Next.js data cache under the public tag. unstable_cache serialises to JSON,
 * so `revive` restores Date fields. Outside Next.js (scripts, tests) there is no cache and the
 * query runs directly.
 */
function cached<A extends unknown[], R>(key: string, query: (...args: A) => Promise<R>, revive: (r: R) => R): (...args: A) => Promise<R> {
  const inCache = unstable_cache(query, [key], { tags: [PUBLIC_CONTENT_TAG], revalidate: PUBLIC_REVALIDATE_SECONDS });
  return async (...args: A) => {
    try {
      return revive(await inCache(...args));
    } catch {
      // No Next.js cache in this context (scripts, tests). A real database failure throws again here.
      return query(...args);
    }
  };
}

const toDate = (v: Date | string | null | undefined): Date | null => (v ? new Date(v) : null);

const rowsFor = cached("cms-published-rows", queryPublishedRows, (rows) =>
  rows.map((r) => ({ ...r, publishAt: toDate(r.publishAt), expiresAt: toDate(r.expiresAt), publishedAt: toDate(r.publishedAt) })),
);

/** Detail rows of published, not-deleted items of one type (public fields are picked later). */
const publishedIds = (type: ContentType) =>
  and(eq(contentItem.type, type), eq(contentItem.status, "PUBLISHED"), isNull(contentItem.deletedAt));

const eventDetails = cached(
  "cms-public-event-details",
  async () =>
    getDb()
      .select({ itemId: eventDetail.itemId, startsAt: eventDetail.startsAt, endsAt: eventDetail.endsAt, locationKind: eventDetail.locationKind, locationText: eventDetail.locationText })
      .from(eventDetail)
      .innerJoin(contentItem, eq(contentItem.id, eventDetail.itemId))
      .where(publishedIds("EVENT")),
  (rows) => rows.map((d) => ({ ...d, startsAt: new Date(d.startsAt), endsAt: toDate(d.endsAt) })),
);

const sermonDetails = cached(
  "cms-public-sermon-details",
  async () =>
    getDb()
      .select({ itemId: sermonDetail.itemId, speaker: sermonDetail.speaker, bibleReference: sermonDetail.bibleReference, sermonDate: sermonDetail.sermonDate, videoUrl: sermonDetail.videoUrl })
      .from(sermonDetail)
      .innerJoin(contentItem, eq(contentItem.id, sermonDetail.itemId))
      .where(publishedIds("SERMON")),
  (rows) => rows,
);

const ministryDetails = cached(
  "cms-public-ministry-details",
  async () =>
    getDb()
      .select({ itemId: ministryDetail.itemId, contactText: ministryDetail.contactText, contactApproved: ministryDetail.contactApproved })
      .from(ministryDetail)
      .innerJoin(contentItem, eq(contentItem.id, ministryDetail.itemId))
      .where(publishedIds("MINISTRY")),
  (rows) => rows,
);

const testimonyDetails = cached(
  "cms-public-testimony-details",
  async () =>
    getDb()
      .select({ itemId: testimonyDetail.itemId, anonymous: testimonyDetail.anonymous, authorDisplayName: testimonyDetail.authorDisplayName })
      .from(testimonyDetail)
      .innerJoin(contentItem, eq(contentItem.id, testimonyDetail.itemId))
      .where(and(publishedIds("TESTIMONY"), eq(testimonyDetail.permissionStatus, "GRANTED"))),
  (rows) => rows,
);

export function toPublic(rows: Row[], locale: ContentLocale, now: Date): PublicItem[] {
  return rows
    .filter((r) => r.locale === locale)
    .filter((r) => isPubliclyVisible({ type: r.type, status: "PUBLISHED", deletedAt: null, publishAt: r.publishAt, expiresAt: r.expiresAt, testimonyPermission: r.testimonyPermission as never }, now))
    .map((r) => ({
      id: r.id, type: r.type, slug: r.slug, featured: r.featured, unlisted: r.visibility === "UNLISTED", publishedAt: r.publishedAt,
      title: r.title, summary: r.summary, bodyMd: r.bodyMd, seoTitle: r.seoTitle, seoDescription: r.seoDescription,
    }))
    .sort((a, b) => Number(b.featured) - Number(a.featured) || (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0));
}

export async function listPublished(type: ContentType, locale: ContentLocale, now = new Date()): Promise<PublicItem[]> {
  return toPublic(await rowsFor(type), locale, now).filter((i) => type !== "PAGE" || !i.unlisted);
}

export async function getPublishedPage(slug: string, locale: ContentLocale, now = new Date()): Promise<PublicItem | null> {
  return toPublic(await rowsFor("PAGE"), locale, now).find((p) => p.slug === slug) ?? null;
}

export interface PublicSpecialMeeting extends PublicItem {
  startsAt: Date;
  endsAt: Date | null;
  locationKind: EventLocation;
  locationText: string;
}

export async function listUpcomingSpecialMeetings(locale: ContentLocale, now = new Date()): Promise<PublicSpecialMeeting[]> {
  const items = await listPublished("EVENT", locale, now);
  if (!items.length) return [];
  const byId = new Map((await eventDetails()).map((d) => [d.itemId, d]));
  return items
    .flatMap((i) => {
      const d = byId.get(i.id);
      // Past meetings leave the site at their end (or start, when no end is given).
      if (!d || (d.endsAt ?? d.startsAt).getTime() < now.getTime()) return [];
      // Members' homes and NECK are never given an address publicly, even if one slipped into the text.
      return [{ ...i, startsAt: d.startsAt, endsAt: d.endsAt, locationKind: d.locationKind, locationText: d.locationKind === "OTHER" ? d.locationText : "" }];
    })
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

export interface PublicSermon extends PublicItem {
  speaker: string;
  bibleReference: string;
  /** "YYYY-MM-DD" (Kuwait date as entered) or null. */
  sermonDate: string | null;
  videoUrl: string;
}

/** Newest sermon first (by sermon date, then publication). */
export async function listPublishedSermons(locale: ContentLocale, now = new Date()): Promise<PublicSermon[]> {
  const items = await listPublished("SERMON", locale, now);
  if (!items.length) return [];
  const byId = new Map((await sermonDetails()).map((d) => [d.itemId, d]));
  return items
    .map((i) => {
      const d = byId.get(i.id);
      const date = d?.sermonDate ? String(d.sermonDate).slice(0, 10) : null;
      return { ...i, speaker: d?.speaker ?? "", bibleReference: d?.bibleReference ?? "", sermonDate: date, videoUrl: d?.videoUrl ?? "" };
    })
    .sort((a, b) => Number(b.featured) - Number(a.featured) || (b.sermonDate ?? "").localeCompare(a.sermonDate ?? ""));
}

export interface PublicMinistry extends PublicItem {
  /** Public contact line, only once a Church Admin approved it. */
  contact: string;
}

export async function listPublishedMinistries(locale: ContentLocale, now = new Date()): Promise<PublicMinistry[]> {
  const items = await listPublished("MINISTRY", locale, now);
  if (!items.length) return [];
  const byId = new Map((await ministryDetails()).map((d) => [d.itemId, d]));
  return items
    .map((i) => {
      const d = byId.get(i.id);
      return { ...i, contact: d?.contactApproved ? d.contactText : "" };
    })
    .sort((a, b) => a.title.localeCompare(b.title, locale));
}

export interface PublicTestimony extends PublicItem {
  /** Display name, or null when the author asked to be anonymous. */
  author: string | null;
}

export async function listPublishedTestimonies(locale: ContentLocale, now = new Date()): Promise<PublicTestimony[]> {
  const items = await listPublished("TESTIMONY", locale, now);
  if (!items.length) return [];
  const byId = new Map((await testimonyDetails()).map((d) => [d.itemId, d]));
  return items.flatMap((i) => {
    const d = byId.get(i.id);
    if (!d) return []; // permission no longer Granted (belt and braces with the row query)
    return [{ ...i, author: d.anonymous ? null : d.authorDisplayName || null }];
  });
}

export interface PublicVerse {
  id: string;
  dateKey: string;
  cardVariant: string;
  preset: string;
  translations: { translationId: string; locale: ContentLocale; name: string; reference: string; text: string | null; creditLine: string; downloadsAllowed: boolean }[];
}

const verseCandidates = cached(
  "cms-public-verse-candidates",
  async (dateKey: string) => {
    const db = getDb();
    const published = await db
      .select({ id: contentItem.id, publishAt: contentItem.publishAt, expiresAt: contentItem.expiresAt })
      .from(contentItem)
      .where(publishedIds("VERSE"));
    const [scheduled] = await db.select({ itemId: verseSchedule.itemId }).from(verseSchedule).where(eq(verseSchedule.dateKey, dateKey));
    return { published, scheduledId: scheduled?.itemId ?? null };
  },
  (r) => ({ ...r, published: r.published.map((v) => ({ ...v, publishAt: toDate(v.publishAt), expiresAt: toDate(v.expiresAt) })) }),
);

const verseCard = cached(
  "cms-public-verse-card",
  async (itemId: string) => {
    const db = getDb();
    const [detail] = await db.select({ cardVariant: verseDetail.cardVariant, preset: verseDetail.preset }).from(verseDetail).where(eq(verseDetail.itemId, itemId));
    const texts = await db
      .select({
        translationId: verseText.translationId, reference: verseText.reference, text: verseText.text, locale: bibleTranslation.locale, name: bibleTranslation.name,
        creditLine: bibleTranslation.creditLine, permission: bibleTranslation.permissionStatus, downloadsAllowed: bibleTranslation.downloadsAllowed,
      })
      .from(verseText)
      .innerJoin(bibleTranslation, eq(bibleTranslation.id, verseText.translationId))
      .where(and(eq(verseText.itemId, itemId), or(sql`${verseText.reference} <> ''`, sql`${verseText.text} <> ''`)));
    // Permission is applied here, before anything leaves the server: unverified text never enters the cache result.
    return {
      cardVariant: detail?.cardVariant ?? "compact",
      preset: detail?.preset ?? "vaigarai",
      translations: texts.map((t) => {
        const verified = t.permission === "VERIFIED";
        return { translationId: t.translationId, locale: t.locale, name: t.name, reference: t.reference, text: verified && t.text ? t.text : null, creditLine: verified ? t.creditLine : "", downloadsAllowed: verified && t.downloadsAllowed };
      }),
    };
  },
  (r) => r,
);

/** Today's verse (Asia/Kuwait). Text is null for any translation whose permission is not verified. */
export async function getDailyVerse(now = new Date()): Promise<PublicVerse | null> {
  const dateKey = kuwaitDateKey(now);
  const { published, scheduledId } = await verseCandidates(dateKey);
  const visible = published.filter((v) => isPubliclyVisible({ type: "VERSE", status: "PUBLISHED", deletedAt: null, publishAt: v.publishAt, expiresAt: v.expiresAt }, now));
  const chosen = pickDailyVerse(dateKey, visible, scheduledId);
  if (!chosen) return null;
  const card = await verseCard(chosen.id);
  return { id: chosen.id, dateKey, ...card };
}
