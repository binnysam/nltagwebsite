import "server-only";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
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

const cachedRows = unstable_cache(async (type: ContentType) => queryPublishedRows(type), ["cms-published-rows"], { tags: [PUBLIC_CONTENT_TAG], revalidate: 300 });

async function rowsFor(type: ContentType): Promise<Row[]> {
  try {
    const rows = await cachedRows(type);
    // unstable_cache serialises to JSON: restore dates.
    return rows.map((r) => ({
      ...r,
      publishAt: r.publishAt ? new Date(r.publishAt) : null,
      expiresAt: r.expiresAt ? new Date(r.expiresAt) : null,
      publishedAt: r.publishedAt ? new Date(r.publishedAt) : null,
    }));
  } catch {
    return queryPublishedRows(type); // outside Next.js (scripts, tests)
  }
}

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
  const details = await getDb().select().from(eventDetail).where(inArray(eventDetail.itemId, items.map((i) => i.id)));
  const byId = new Map(details.map((d) => [d.itemId, d]));
  return items
    .flatMap((i) => {
      const d = byId.get(i.id);
      if (!d || (d.endsAt ?? d.startsAt).getTime() < now.getTime()) return [];
      // Members' homes are never given an address publicly, even if one slipped into the text.
      return [{ ...i, startsAt: d.startsAt, endsAt: d.endsAt, locationKind: d.locationKind, locationText: d.locationKind === "OTHER" ? d.locationText : "" }];
    })
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

export async function listPublishedSermons(locale: ContentLocale, now = new Date()) {
  const items = await listPublished("SERMON", locale, now);
  if (!items.length) return [];
  const details = await getDb().select().from(sermonDetail).where(inArray(sermonDetail.itemId, items.map((i) => i.id)));
  const byId = new Map(details.map((d) => [d.itemId, d]));
  return items.map((i) => {
    const d = byId.get(i.id);
    return { ...i, speaker: d?.speaker ?? "", bibleReference: d?.bibleReference ?? "", sermonDate: d?.sermonDate ?? null, videoUrl: d?.videoUrl ?? "" };
  });
}

export async function listPublishedMinistries(locale: ContentLocale, now = new Date()) {
  const items = await listPublished("MINISTRY", locale, now);
  if (!items.length) return [];
  const details = await getDb().select().from(ministryDetail).where(inArray(ministryDetail.itemId, items.map((i) => i.id)));
  const byId = new Map(details.map((d) => [d.itemId, d]));
  return items.map((i) => {
    const d = byId.get(i.id);
    return { ...i, contact: d?.contactApproved ? d.contactText : "" };
  });
}

export async function listPublishedTestimonies(locale: ContentLocale, now = new Date()) {
  const items = await listPublished("TESTIMONY", locale, now);
  if (!items.length) return [];
  const details = await getDb().select().from(testimonyDetail).where(inArray(testimonyDetail.itemId, items.map((i) => i.id)));
  const byId = new Map(details.map((d) => [d.itemId, d]));
  return items.map((i) => {
    const d = byId.get(i.id);
    return { ...i, author: d && !d.anonymous ? d.authorDisplayName : null };
  });
}

export interface PublicVerse {
  id: string;
  dateKey: string;
  cardVariant: string;
  preset: string;
  translations: { translationId: string; locale: ContentLocale; name: string; reference: string; text: string | null; creditLine: string; downloadsAllowed: boolean }[];
}

/** Today's verse (Asia/Kuwait). Text is null for any translation whose permission is not verified. */
export async function getDailyVerse(now = new Date()): Promise<PublicVerse | null> {
  const dateKey = kuwaitDateKey(now);
  const db = getDb();
  const published = await db
    .select({ id: contentItem.id, publishAt: contentItem.publishAt, expiresAt: contentItem.expiresAt })
    .from(contentItem)
    .where(and(eq(contentItem.type, "VERSE"), eq(contentItem.status, "PUBLISHED"), isNull(contentItem.deletedAt)));
  const visible = published.filter((v) => isPubliclyVisible({ type: "VERSE", status: "PUBLISHED", deletedAt: null, publishAt: v.publishAt, expiresAt: v.expiresAt }, now));
  const [scheduled] = await db.select({ itemId: verseSchedule.itemId }).from(verseSchedule).where(eq(verseSchedule.dateKey, dateKey));
  const chosen = pickDailyVerse(dateKey, visible, scheduled?.itemId);
  if (!chosen) return null;
  const [detail] = await db.select().from(verseDetail).where(eq(verseDetail.itemId, chosen.id));
  const texts = await db
    .select({
      translationId: verseText.translationId, reference: verseText.reference, text: verseText.text, locale: bibleTranslation.locale, name: bibleTranslation.name,
      creditLine: bibleTranslation.creditLine, permission: bibleTranslation.permissionStatus, downloadsAllowed: bibleTranslation.downloadsAllowed,
    })
    .from(verseText)
    .innerJoin(bibleTranslation, eq(bibleTranslation.id, verseText.translationId))
    .where(and(eq(verseText.itemId, chosen.id), or(sql`${verseText.reference} <> ''`, sql`${verseText.text} <> ''`)));
  return {
    id: chosen.id,
    dateKey,
    cardVariant: detail?.cardVariant ?? "compact",
    preset: detail?.preset ?? "vaigarai",
    translations: texts.map((t) => {
      const verified = t.permission === "VERIFIED";
      return { translationId: t.translationId, locale: t.locale, name: t.name, reference: t.reference, text: verified && t.text ? t.text : null, creditLine: verified ? t.creditLine : "", downloadsAllowed: verified && t.downloadsAllowed };
    }),
  };
}
