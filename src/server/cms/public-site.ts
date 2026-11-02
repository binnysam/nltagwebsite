import "server-only";
import { connection } from "next/server";
import type { Locale } from "@/content/ui-strings";
import { log } from "../security/log";
import {
  getDailyVerse, getPublishedPage, listPublished, listPublishedMinistries, listPublishedSermons, listPublishedTestimonies,
  listUpcomingSpecialMeetings, type PublicItem, type PublicMinistry, type PublicSermon, type PublicSpecialMeeting,
  type PublicTestimony, type PublicVerse,
} from "./public";

/**
 * Read-only loaders for the public website (Phase 5). Every page reads published content only
 * through src/server/cms/public.ts; this file adds two things on top:
 *
 *   1. Request-time rendering. `connection()` opts the page out of build-time prerendering, so the
 *      publish/expiry window is checked against the real "now" on every request (the database
 *      reads themselves stay cached under the `cms:published` tag for 5 minutes and are expired at
 *      once by any CMS write that touches public output).
 *   2. Graceful failure. If the database is unreachable (or not configured, as in a build without
 *      DATABASE_URL), each section falls back to its designed empty state instead of failing the
 *      page. The failure is logged once per section and process, without connection details.
 *
 * Reserved page slugs (CMS → Pages): `welcome` (summary = hero lead), `about`, `contact`.
 */

export const RESERVED_PAGE_SLUGS = { welcome: "welcome", about: "about", contact: "contact" } as const;

const warned = new Set<string>();

async function safely<T>(section: string, load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load();
  } catch (err) {
    if (!warned.has(section)) {
      warned.add(section);
      log("warn", "public.content_unavailable", { section, error: err instanceof Error ? err.name : "unknown" });
    }
    return fallback;
  }
}

/** A special meeting with both language versions (cards show Tamil first, English beneath). */
export interface BilingualMeeting {
  id: string;
  startsAt: Date;
  endsAt: Date | null;
  locationKind: PublicSpecialMeeting["locationKind"];
  locationText: string;
  featured: boolean;
  ta: { title: string; summary: string } | null;
  en: { title: string; summary: string } | null;
}

export async function loadSpecialMeetings(now = new Date()): Promise<BilingualMeeting[]> {
  return safely(
    "special-meetings",
    async () => {
      const [ta, en] = await Promise.all([listUpcomingSpecialMeetings("ta", now), listUpcomingSpecialMeetings("en", now)]);
      const byId = new Map<string, BilingualMeeting>();
      for (const [locale, list] of [["ta", ta], ["en", en]] as const) {
        for (const m of list) {
          const entry = byId.get(m.id) ?? {
            id: m.id, startsAt: m.startsAt, endsAt: m.endsAt, locationKind: m.locationKind, locationText: m.locationText, featured: m.featured, ta: null, en: null,
          };
          entry[locale] = { title: m.title, summary: m.summary };
          byId.set(m.id, entry);
        }
      }
      return [...byId.values()].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    },
    [],
  );
}

export interface HomeContent {
  welcome: PublicItem | null;
  about: PublicItem | null;
  contact: PublicItem | null;
  announcements: PublicItem[];
  meetings: BilingualMeeting[];
  ministries: PublicMinistry[];
  sermons: PublicSermon[];
  testimonies: PublicTestimony[];
  verse: PublicVerse | null;
}

export async function loadHomeContent(locale: Locale): Promise<HomeContent> {
  await connection();
  const now = new Date();
  const [welcome, about, contact, announcements, meetings, ministries, sermons, testimonies, verse] = await Promise.all([
    safely("page-welcome", () => getPublishedPage(RESERVED_PAGE_SLUGS.welcome, locale, now), null),
    safely("page-about", () => getPublishedPage(RESERVED_PAGE_SLUGS.about, locale, now), null),
    safely("page-contact", () => getPublishedPage(RESERVED_PAGE_SLUGS.contact, locale, now), null),
    safely("announcements", () => listPublished("ANNOUNCEMENT", locale, now), []),
    loadSpecialMeetings(now),
    safely("ministries", () => listPublishedMinistries(locale, now), []),
    safely("sermons", () => listPublishedSermons(locale, now), []),
    safely("testimonies", () => listPublishedTestimonies(locale, now), []),
    safely("verse", () => getDailyVerse(now), null),
  ]);
  return { welcome, about, contact, announcements, meetings, ministries, sermons, testimonies, verse };
}

export async function loadPage(slug: string, locale: Locale): Promise<PublicItem | null> {
  await connection();
  return safely(`page-${slug}`, () => getPublishedPage(slug, locale), null);
}

export async function loadAnnouncements(locale: Locale) {
  await connection();
  return safely("announcements", () => listPublished("ANNOUNCEMENT", locale), []);
}

export async function loadSermons(locale: Locale) {
  await connection();
  return safely("sermons", () => listPublishedSermons(locale), []);
}

export async function loadMinistries(locale: Locale) {
  await connection();
  return safely("ministries", () => listPublishedMinistries(locale), []);
}

export async function loadTestimonies(locale: Locale) {
  await connection();
  return safely("testimonies", () => listPublishedTestimonies(locale), []);
}

export async function loadMeetingsNow() {
  await connection();
  return loadSpecialMeetings();
}
