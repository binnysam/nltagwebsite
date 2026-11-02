import { utcToKuwaitLocal } from "@/lib/date";
import type { ModuleDef } from "@/server/cms/registry";
import type { EditableItem, Ctx } from "@/server/cms/service";
import { listMedia } from "@/server/cms/service";
import type { FormModule, FormValues } from "../_components/ContentForm.client";

const empty = { title: "", summary: "", bodyMd: "", seoTitle: "", seoDescription: "", state: "DRAFT" as const };

export function emptyValues(): FormValues {
  return { slug: "", visibility: "PUBLIC", featured: false, publishAt: "", expiresAt: "", ta: { ...empty }, en: { ...empty }, detail: { anonymous: true } };
}

/** Serialisable form values from a stored item (dates shown in Kuwait time). */
export function toFormValues(item: EditableItem): FormValues {
  const detail: Record<string, string | boolean> = {};
  for (const [k, v] of Object.entries(item.detail ?? {})) {
    if (v instanceof Date) detail[k] = utcToKuwaitLocal(v);
    else if (typeof v === "boolean") detail[k] = v;
    else detail[k] = v == null ? "" : String(v);
  }
  return {
    slug: item.slug, visibility: item.visibility, featured: item.featured,
    publishAt: utcToKuwaitLocal(item.publishAt), expiresAt: utcToKuwaitLocal(item.expiresAt),
    ta: item.translations.ta, en: item.translations.en, detail,
  };
}

export const formModule = (m: ModuleDef): FormModule => ({ type: m.type, singular: m.singular, slugAllowed: m.slugAllowed, slugRequired: m.slugRequired, supports: m.supports });

export async function mediaChoices(ctx: Ctx) {
  const rows = await listMedia(ctx);
  return rows.map((r) => ({ id: r.id, label: r.altEn || r.altTa || `Image ${r.id.slice(0, 8)}` }));
}
