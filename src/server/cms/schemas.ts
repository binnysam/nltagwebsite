import { z } from "zod";
import { kuwaitLocalToUtc } from "@/lib/date";
import {
  EVENT_LOCATIONS, TESTIMONY_PERMISSIONS, TRANSLATION_STATES, VERSE_CARD_VARIANTS, VERSE_PRESETS, VISIBILITIES,
  type ContentType,
} from "../db/schema/content";
import { moduleByType } from "./registry";

/**
 * Server-side validation for every CMS write (Zod). The browser form is a convenience; these
 * rules are the only ones that count.
 *
 * Text rules: Unicode NFC (Tamil compares and sorts correctly), trimmed, LF line endings,
 * no control characters and no HTML tags. Body text is Markdown; links may only use
 * https:, http:, mailto: or a site-relative path.
 */

const HTML_TAG = /<\/?[a-z!?][^>]*>/i;
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const UNSAFE_LINK = /\]\(\s*(?!https?:\/\/|mailto:|\/(?!\/)|#)[^)]*\)|(?:javascript|vbscript|data)\s*:/i;

export const normalizeText = (v: unknown) => (typeof v === "string" ? v.normalize("NFC").replace(/\r\n?/g, "\n").trim() : "");

const safeText = (max: number, label = "This field") =>
  z
    .preprocess(normalizeText, z.string())
    .pipe(
      z
        .string()
        .max(max, `${label} must be ${max} characters or fewer.`)
        .refine((v) => !HTML_TAG.test(v), "HTML is not allowed. Use plain text or Markdown.")
        .refine((v) => !CONTROL_CHARS.test(v), "Remove the hidden control characters."),
    );

const singleLine = (max: number, label?: string) => safeText(max, label).refine((v) => !v.includes("\n"), "Use a single line.");

export const markdownBody = safeText(50_000, "The text").refine((v) => !UNSAFE_LINK.test(v), "Links must start with https://, http://, mailto: or /.");

const RESERVED_SLUGS = new Set([
  "admin", "api", "account", "sign-in", "sign-up", "forgot-password", "reset-password", "verify-email",
  "design-system", "media", "preview", "ta", "en", "_next", "sitemap", "robots",
]);

export const slugSchema = z
  .preprocess((v) => normalizeText(v).toLowerCase(), z.string())
  .pipe(
    z
      .string()
      .max(120, "The address must be 120 characters or fewer.")
      .refine((v) => v === "" || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v), "Use lower-case letters, numbers and single hyphens (for example: about-us).")
      .refine((v) => !RESERVED_SLUGS.has(v), "That address is reserved by the website."),
  );

const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

const kuwaitDateTime = (label: string) =>
  z.preprocess(normalizeText, z.string()).transform((v, ctx) => {
    if (v === "") return null;
    const d = kuwaitLocalToUtc(v);
    if (!d) {
      ctx.addIssue({ code: "custom", message: `${label}: enter a valid date and time.` });
      return z.NEVER;
    }
    return d;
  });

export const httpsUrl = z
  .preprocess(normalizeText, z.string())
  .pipe(
    z
      .string()
      .max(500, "The link must be 500 characters or fewer.")
      .refine((v) => {
        if (v === "") return true;
        try {
          const u = new URL(v);
          return u.protocol === "https:" && !u.username && !u.password;
        } catch {
          return false;
        }
      }, "Enter a full https:// link."),
  );

const translationSchema = z.object({
  title: singleLine(200, "The title"),
  summary: safeText(500, "The summary"),
  bodyMd: markdownBody,
  seoTitle: singleLine(120, "The SEO title"),
  seoDescription: safeText(320, "The SEO description"),
  state: z.enum(TRANSLATION_STATES).catch("DRAFT"),
});
export type TranslationInput = z.infer<typeof translationSchema>;

const assetId = z.preprocess((v) => normalizeText(v) || null, z.string().regex(/^[0-9a-f-]{36}$/, "Choose an image from the media library.").nullable());

const detailSchemas = {
  EVENT: z.object({
    startsAt: kuwaitDateTime("Starts"),
    endsAt: kuwaitDateTime("Ends"),
    locationKind: z.enum(EVENT_LOCATIONS).catch("TO_BE_ANNOUNCED"),
    locationText: singleLine(200, "The location"),
  }),
  SERMON: z.object({
    speaker: singleLine(200, "The speaker"),
    bibleReference: singleLine(120, "The Bible reference"),
    sermonDate: z.preprocess(normalizeText, z.string()).pipe(z.string().refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Enter a valid date.")),
    videoUrl: httpsUrl,
    thumbnailAssetId: assetId,
  }),
  MINISTRY: z.object({
    imageAssetId: assetId,
    contactText: singleLine(300, "The contact line"),
    contactApproved: checkbox,
  }),
  TESTIMONY: z.object({
    authorDisplayName: singleLine(120, "The display name"),
    anonymous: checkbox,
  }),
  VERSE: z.object({
    cardVariant: z.enum(VERSE_CARD_VARIANTS).catch("compact"),
    preset: z.enum(VERSE_PRESETS).catch("vaigarai"),
    referenceTa: singleLine(120, "The Tamil reference"),
    textTa: safeText(2000, "The Tamil verse text"),
    referenceEn: singleLine(120, "The English reference"),
    textEn: safeText(2000, "The English verse text"),
  }),
} as const;

export type DetailInput<T extends keyof typeof detailSchemas> = z.infer<(typeof detailSchemas)[T]>;

const baseSchema = z.object({
  slug: slugSchema,
  visibility: z.enum(VISIBILITIES).catch("PUBLIC"),
  featured: checkbox,
  publishAt: kuwaitDateTime("Publish from"),
  expiresAt: kuwaitDateTime("Expires"),
  ta: translationSchema,
  en: translationSchema,
});

export type ContentInput = z.infer<typeof baseSchema> & { detail: Record<string, unknown> | null };

export type FieldErrors = Record<string, string>;
export type ParseResult = { ok: true; data: ContentInput } | { ok: false; errors: FieldErrors };

/** Reads a submitted content form. Field names: slug, ta.title, en.bodyMd, detail.startsAt … */
export function parseContentForm(type: ContentType, form: FormData): ParseResult {
  const get = (k: string) => form.get(k) ?? "";
  const translation = (l: "ta" | "en") => ({
    title: get(`${l}.title`), summary: get(`${l}.summary`), bodyMd: get(`${l}.bodyMd`),
    seoTitle: get(`${l}.seoTitle`), seoDescription: get(`${l}.seoDescription`), state: get(`${l}.state`),
  });
  const raw = {
    slug: get("slug"), visibility: get("visibility"), featured: get("featured"),
    publishAt: get("publishAt"), expiresAt: get("expiresAt"),
    ta: translation("ta"), en: translation("en"),
  };
  const errors: FieldErrors = {};
  const base = baseSchema.safeParse(raw);
  if (!base.success) for (const i of base.error.issues) errors[i.path.join(".")] ??= i.message;

  let detail: Record<string, unknown> | null = null;
  const detailSchema = (detailSchemas as Record<string, z.ZodType<Record<string, unknown>>>)[type];
  if (detailSchema) {
    const rawDetail = Object.fromEntries([...form.keys()].filter((k) => k.startsWith("detail.")).map((k) => [k.slice(7), form.get(k)]));
    const parsed = detailSchema.safeParse(rawDetail);
    if (!parsed.success) for (const i of parsed.error.issues) errors[`detail.${i.path.join(".")}`] ??= i.message;
    else detail = parsed.data;
  }
  if (!base.success || Object.keys(errors).length) return { ok: false, errors };

  const data: ContentInput = { ...base.data, detail };
  crossFieldRules(type, data, errors);
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data };
}

function crossFieldRules(type: ContentType, data: ContentInput, errors: FieldErrors) {
  const mod = moduleByType(type);
  if (!data.ta.title && !data.en.title) errors["ta.title"] = "Add a title in Tamil or English.";
  if (mod.slugRequired && !data.slug) errors.slug = "Pages need an address (slug).";
  if (!mod.slugAllowed) data.slug = "";
  if (!mod.supports.schedule) {
    data.publishAt = null;
    data.expiresAt = null;
  }
  if (!mod.supports.featured) data.featured = false;
  if (!mod.supports.visibility) data.visibility = "PUBLIC";
  if (data.publishAt && data.expiresAt && data.expiresAt <= data.publishAt) errors.expiresAt = "Expiry must be after the publish time.";

  if (type === "EVENT") {
    const d = data.detail as DetailInput<"EVENT">;
    if (!d.startsAt) errors["detail.startsAt"] = "Enter the date and start time (Kuwait time).";
    if (d.startsAt && d.endsAt && d.endsAt <= d.startsAt) errors["detail.endsAt"] = "The end must be after the start.";
    // Privacy: members' homes and NECK never carry an address; OTHER needs a short place name.
    if (d.locationKind === "MEMBERS_HOMES" && d.locationText) errors["detail.locationText"] = "Do not publish a member's home address. Leave this empty.";
    if (d.locationKind === "NECK" && d.locationText) errors["detail.locationText"] = "NECK needs no address. Leave this empty.";
    if (d.locationKind === "TO_BE_ANNOUNCED") d.locationText = "";
    if (d.locationKind === "OTHER" && !d.locationText) errors["detail.locationText"] = "Name the place (no private home addresses).";
  }
  if (type === "TESTIMONY") {
    const d = data.detail as DetailInput<"TESTIMONY">;
    if (!d.anonymous && !d.authorDisplayName) errors["detail.authorDisplayName"] = "Add the display name, or mark the testimony as anonymous.";
    if (d.anonymous) d.authorDisplayName = "";
  }
  if (type === "VERSE") {
    const d = data.detail as DetailInput<"VERSE">;
    if (!d.referenceTa && !d.referenceEn) errors["detail.referenceTa"] = "Add the reference in at least one language.";
  }
}

export const testimonyPermissionSchema = z.enum(TESTIMONY_PERMISSIONS);

export const translationPermissionSchema = z.object({
  translationId: z.enum(["bsi-ta", "nkjv-en"]),
  verified: checkbox,
  downloadsAllowed: checkbox,
  creditLine: singleLine(300, "The credit line"),
  permissionReference: singleLine(300, "The permission reference"),
});

export const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date.");
