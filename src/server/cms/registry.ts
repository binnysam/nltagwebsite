import type { ContentType } from "../db/schema/content";

/**
 * One entry per content module. The admin builds its navigation, list pages and forms from this
 * table, so every module shares the same workflow and visual language.
 */
export interface ModuleDef {
  type: ContentType;
  /** URL segment under /admin. */
  segment: string;
  label: string;
  singular: string;
  description: string;
  /** Pages need a slug (their address). Other types may have one. */
  slugRequired: boolean;
  slugAllowed: boolean;
  /** Fields shown on the form beyond titles and text. */
  supports: { summary: boolean; body: boolean; seo: boolean; featured: boolean; schedule: boolean; visibility: boolean };
}

export const MODULES: readonly ModuleDef[] = [
  {
    type: "PAGE", segment: "pages", label: "Pages", singular: "page",
    description: "Standalone pages such as About or Contact. Each has an address (slug) and its own SEO details.",
    slugRequired: true, slugAllowed: true,
    supports: { summary: true, body: true, seo: true, featured: false, schedule: false, visibility: true },
  },
  {
    type: "ANNOUNCEMENT", segment: "announcements", label: "Announcements", singular: "announcement",
    description: "Short notices. Can be scheduled, set to expire and featured.",
    slugRequired: false, slugAllowed: true,
    supports: { summary: true, body: true, seo: false, featured: true, schedule: true, visibility: false },
  },
  {
    type: "EVENT", segment: "events", label: "Special meetings", singular: "special meeting",
    description: "Individually announced meetings. The regular weekly schedule is fixed (Gate 0) and shown for reference.",
    slugRequired: false, slugAllowed: true,
    supports: { summary: true, body: true, seo: false, featured: true, schedule: false, visibility: false },
  },
  {
    type: "SERMON", segment: "sermons", label: "Sermons", singular: "sermon",
    description: "Sermon records with speaker, Bible reference and a video link. Video is linked, never re-hosted.",
    slugRequired: false, slugAllowed: true,
    supports: { summary: true, body: true, seo: false, featured: true, schedule: false, visibility: false },
  },
  {
    type: "MINISTRY", segment: "ministries", label: "Ministries", singular: "ministry",
    description: "Church ministries with an optional image and an approved public contact line.",
    slugRequired: false, slugAllowed: true,
    supports: { summary: true, body: true, seo: false, featured: false, schedule: false, visibility: false },
  },
  {
    type: "TESTIMONY", segment: "testimonies", label: "Testimonies", singular: "testimony",
    description: "Published only with recorded permission. The author can be anonymous.",
    slugRequired: false, slugAllowed: false,
    supports: { summary: false, body: true, seo: false, featured: true, schedule: false, visibility: false },
  },
  {
    type: "VERSE", segment: "verses", label: "Bible verses", singular: "verse",
    description: "Verse cards (Tamil BSI, English NKJV). Verse text stays private until publishing permission is verified.",
    slugRequired: false, slugAllowed: false,
    supports: { summary: false, body: false, seo: false, featured: false, schedule: false, visibility: false },
  },
];

export const moduleByType = (type: ContentType) => MODULES.find((m) => m.type === type)!;
export const moduleBySegment = (segment: string) => MODULES.find((m) => m.segment === segment);
