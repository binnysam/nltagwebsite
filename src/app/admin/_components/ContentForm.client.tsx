"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button, CheckboxField, Notice, SelectField, TextField } from "@/design-system/components";
import { Surface } from "@/design-system/primitives";
import { saveContentAction } from "../actions";
import { keepValues } from "./keep-values";
import type { ActionState } from "../_lib/staff";
import styles from "../admin.module.css";

export interface TranslationValues {
  title: string;
  summary: string;
  bodyMd: string;
  seoTitle: string;
  seoDescription: string;
  state: "EMPTY" | "DRAFT" | "READY";
}

export interface FormValues {
  slug: string;
  visibility: "PUBLIC" | "UNLISTED";
  featured: boolean;
  publishAt: string;
  expiresAt: string;
  ta: TranslationValues;
  en: TranslationValues;
  detail: Record<string, string | boolean>;
}

export interface FormModule {
  type: string;
  singular: string;
  slugAllowed: boolean;
  slugRequired: boolean;
  supports: { summary: boolean; body: boolean; seo: boolean; featured: boolean; schedule: boolean; visibility: boolean };
}

const fid = (name: string) => `f-${name.replace(/\./g, "-")}`;
const MARKDOWN_HINT = "Markdown: ## heading, **bold**, *italic*, - list, [link text](https://…). HTML is not allowed.";

/**
 * Content editor: shared details, type-specific details, then Tamil and English side by side
 * (stacked on phones). Every rule is enforced again on the server; this form only helps.
 */
export function ContentForm({
  mod, id, version, values, readOnly, readOnlyReason, isPublisher, media,
}: {
  mod: FormModule;
  id?: string;
  version?: number;
  values: FormValues;
  readOnly: boolean;
  readOnlyReason?: string;
  isPublisher: boolean;
  media: { id: string; label: string }[];
}) {
  const [state, action, pending] = useActionState(saveContentAction, { ok: false, message: "", seq: 0, version } as ActionState);
  const summaryRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.seq) summaryRef.current?.focus();
  }, [state.seq]);
  const err = (name: string) => state.errors?.[name];
  const d = values.detail;
  const str = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : "");
  const mediaOptions = [{ value: "", label: "No image" }, ...media.map((m) => ({ value: m.id, label: m.label }))];
  const currentVersion = state.version ?? version;

  return (
    <form onSubmit={keepValues(action)} className={styles.form} noValidate>
      <input type="hidden" name="type" value={mod.type} />
      {id ? <input type="hidden" name="id" value={id} /> : null}
      {currentVersion ? <input type="hidden" name="version" value={currentVersion} /> : null}

      <div ref={summaryRef} tabIndex={-1}>
        {state.seq ? (
          <Notice tone={state.ok ? "success" : "error"} title={state.ok ? "Saved" : "Not saved"}>
            <p>{state.message}</p>
            {state.errors && Object.keys(state.errors).length ? (
              <ul>
                {Object.entries(state.errors).map(([k, v]) => (
                  <li key={k}><a href={`#${fid(k)}`}>{v}</a></li>
                ))}
              </ul>
            ) : null}
          </Notice>
        ) : null}
      </div>
      {readOnly && readOnlyReason ? <Notice tone="info" title="Read only"><p>{readOnlyReason}</p></Notice> : null}

      <fieldset className={styles.fieldset} disabled={readOnly}>
        {mod.slugAllowed || mod.supports.visibility || mod.supports.featured || mod.supports.schedule ? (
          <Surface className={styles.card}>
            <h2 className={styles.cardTitle}>Details</h2>
            <div className={styles.fieldGrid}>
              {mod.slugAllowed ? (
                <TextField id={fid("slug")} name="slug" label="Address (slug)" requirementText={mod.slugRequired ? "Required" : "Optional"} hint="Lower-case letters, numbers and hyphens. Same for both languages, e.g. about-us." defaultValue={values.slug} error={err("slug")} autoComplete="off" spellCheck={false} />
              ) : null}
              {mod.supports.visibility ? (
                <SelectField id={fid("visibility")} name="visibility" label="Visibility" hint="Unlisted pages work by their address but are left out of menus and the sitemap." defaultValue={values.visibility} options={[{ value: "PUBLIC", label: "Public" }, { value: "UNLISTED", label: "Unlisted" }]} />
              ) : null}
              {mod.supports.schedule ? (
                <>
                  <TextField id={fid("publishAt")} name="publishAt" type="datetime-local" label="Publish from (Kuwait time)" requirementText="Optional" hint="Leave empty to show as soon as it is published." defaultValue={values.publishAt} error={err("publishAt")} />
                  <TextField id={fid("expiresAt")} name="expiresAt" type="datetime-local" label="Expires (Kuwait time)" requirementText="Optional" defaultValue={values.expiresAt} error={err("expiresAt")} />
                </>
              ) : null}
            </div>
            {mod.supports.featured ? <CheckboxField id={fid("featured")} name="featured" label="Feature this item" hint="Featured items are listed first." defaultChecked={values.featured} /> : null}
          </Surface>
        ) : null}

        <TypeDetails type={mod.type} str={str} d={d} err={err} isPublisher={isPublisher} mediaOptions={mediaOptions} />

        <div className={styles.languages}>
          {(["ta", "en"] as const).map((l) => {
            const t = values[l];
            const lang = l === "ta" ? "ta" : undefined;
            const isVerse = mod.type === "VERSE";
            return (
              <Surface key={l} className={styles.card}>
                <fieldset className={styles.fieldset}>
                  <legend className={styles.legend}>
                    {l === "ta" ? <>Tamil · <span lang="ta">தமிழ்</span></> : "English"}
                  </legend>
                  <TextField id={fid(`${l}.title`)} name={`${l}.title`} lang={lang} label={isVerse ? "Card label (staff only)" : "Title"} hint={isVerse ? "Helps staff find the verse. Not shown on the card." : undefined} defaultValue={t.title} error={err(`${l}.title`)} maxLength={200} />
                  {mod.supports.summary ? <TextField multiline id={fid(`${l}.summary`)} name={`${l}.summary`} lang={lang} label="Summary" requirementText="Optional" hint="One or two sentences for lists and previews." defaultValue={t.summary} error={err(`${l}.summary`)} maxLength={500} rows={2} /> : null}
                  {mod.supports.body ? <TextField multiline id={fid(`${l}.bodyMd`)} name={`${l}.bodyMd`} lang={lang} label="Text" hint={MARKDOWN_HINT} defaultValue={t.bodyMd} error={err(`${l}.bodyMd`)} rows={10} /> : null}
                  {mod.supports.seo ? (
                    <>
                      <TextField id={fid(`${l}.seoTitle`)} name={`${l}.seoTitle`} lang={lang} label="SEO title" requirementText="Optional" hint="Shown in search results and browser tabs. Defaults to the title." defaultValue={t.seoTitle} error={err(`${l}.seoTitle`)} maxLength={120} />
                      <TextField multiline id={fid(`${l}.seoDescription`)} name={`${l}.seoDescription`} lang={lang} label="SEO description" requirementText="Optional" hint="About 150 characters." defaultValue={t.seoDescription} error={err(`${l}.seoDescription`)} maxLength={320} rows={2} />
                    </>
                  ) : null}
                  <SelectField id={fid(`${l}.state`)} name={`${l}.state`} label="This language is" defaultValue={t.state === "EMPTY" ? "DRAFT" : t.state} options={[{ value: "DRAFT", label: "Still being written" }, { value: "READY", label: "Ready for review" }]} />
                </fieldset>
              </Surface>
            );
          })}
        </div>
      </fieldset>

      {!readOnly ? (
        <div className={styles.actionsBar}>
          <Button type="submit" loading={pending} loadingLabel="Saving">{id ? "Save changes" : "Save draft"}</Button>
          <span className={styles.actionsHint}>{id ? "Saving keeps the current status." : `The ${mod.singular} is saved as a draft. Nothing is public until a Church Admin publishes it.`}</span>
        </div>
      ) : null}
    </form>
  );
}

function TypeDetails({
  type, str, d, err, isPublisher, mediaOptions,
}: {
  type: string;
  str: (k: string) => string;
  d: Record<string, string | boolean>;
  err: (k: string) => string | undefined;
  isPublisher: boolean;
  mediaOptions: { value: string; label: string }[];
}) {
  switch (type) {
    case "EVENT":
      return (
        <Surface className={styles.card}>
          <h2 className={styles.cardTitle}>Date, time and place</h2>
          <div className={styles.fieldGrid}>
            <TextField id={fid("detail.startsAt")} name="detail.startsAt" type="datetime-local" label="Starts (Kuwait time)" requirementText="Required" defaultValue={str("startsAt")} error={err("detail.startsAt")} />
            <TextField id={fid("detail.endsAt")} name="detail.endsAt" type="datetime-local" label="Ends (Kuwait time)" requirementText="Optional" defaultValue={str("endsAt")} error={err("detail.endsAt")} />
            <SelectField
              id={fid("detail.locationKind")} name="detail.locationKind" label="Where" defaultValue={str("locationKind") || "TO_BE_ANNOUNCED"}
              options={[{ value: "TO_BE_ANNOUNCED", label: "To be announced" }, { value: "NECK", label: "NECK" }, { value: "MEMBERS_HOMES", label: "Church members' homes (no address shown)" }, { value: "OTHER", label: "Another place" }]}
            />
            <TextField id={fid("detail.locationText")} name="detail.locationText" label="Place name" requirementText="Only for “Another place”" hint="A hall or venue name. Never a member's home address." defaultValue={str("locationText")} error={err("detail.locationText")} maxLength={200} />
          </div>
        </Surface>
      );
    case "SERMON":
      return (
        <Surface className={styles.card}>
          <h2 className={styles.cardTitle}>Sermon details</h2>
          <div className={styles.fieldGrid}>
            <TextField id={fid("detail.speaker")} name="detail.speaker" label="Speaker" defaultValue={str("speaker")} error={err("detail.speaker")} maxLength={200} />
            <TextField id={fid("detail.bibleReference")} name="detail.bibleReference" label="Bible reference" hint="For example John 3:16. Reference only, no verse text." defaultValue={str("bibleReference")} error={err("detail.bibleReference")} maxLength={120} />
            <TextField id={fid("detail.sermonDate")} name="detail.sermonDate" type="date" label="Sermon date" defaultValue={str("sermonDate")} error={err("detail.sermonDate")} />
            <TextField id={fid("detail.videoUrl")} name="detail.videoUrl" type="url" label="Video link" hint="A https:// link to the church's own video (YouTube). The video is linked, never downloaded or re-hosted." defaultValue={str("videoUrl")} error={err("detail.videoUrl")} />
            <SelectField id={fid("detail.thumbnailAssetId")} name="detail.thumbnailAssetId" label="Thumbnail" hint="Upload images in Media first." defaultValue={str("thumbnailAssetId")} options={mediaOptions} />
          </div>
        </Surface>
      );
    case "MINISTRY":
      return (
        <Surface className={styles.card}>
          <h2 className={styles.cardTitle}>Ministry details</h2>
          <div className={styles.fieldGrid}>
            <SelectField id={fid("detail.imageAssetId")} name="detail.imageAssetId" label="Image" hint="Upload images in Media first." defaultValue={str("imageAssetId")} options={mediaOptions} />
            <TextField id={fid("detail.contactText")} name="detail.contactText" label="Public contact line" requirementText="Optional" hint="Shown only after a Church Admin approves it. Changing it withdraws approval." defaultValue={str("contactText")} error={err("detail.contactText")} maxLength={300} />
          </div>
          <CheckboxField id={fid("detail.contactApproved")} name="detail.contactApproved" label="Contact line approved for publication" defaultChecked={d.contactApproved === true} disabled={!isPublisher} hint={isPublisher ? undefined : "Church Admin only."} />
        </Surface>
      );
    case "TESTIMONY":
      return (
        <Surface className={styles.card}>
          <h2 className={styles.cardTitle}>Author</h2>
          <CheckboxField id={fid("detail.anonymous")} name="detail.anonymous" label="Publish anonymously" defaultChecked={d.anonymous !== false} hint="Recommended unless the author asked to be named." />
          <TextField id={fid("detail.authorDisplayName")} name="detail.authorDisplayName" label="Display name" requirementText="Only if not anonymous" hint="Exactly as the author agreed. No surnames, contact details or private information." defaultValue={str("authorDisplayName")} error={err("detail.authorDisplayName")} maxLength={120} />
        </Surface>
      );
    case "VERSE":
      return (
        <Surface className={styles.card}>
          <h2 className={styles.cardTitle}>Verse card</h2>
          <Notice tone="warning" title="Bible text stays private">
            <p>Verse text is stored for later. The website shows it only after the publisher&apos;s permission for that translation is recorded under Bible verses → Translations.</p>
          </Notice>
          <div className={styles.fieldGrid}>
            <SelectField id={fid("detail.cardVariant")} name="detail.cardVariant" label="Card variant" defaultValue={str("cardVariant") || "compact"} options={[{ value: "compact", label: "Compact" }, { value: "landscape", label: "Landscape" }, { value: "square", label: "Square (social)" }, { value: "portrait", label: "Portrait (social)" }]} />
            <SelectField id={fid("detail.preset")} name="detail.preset" label="Background" defaultValue={str("preset") || "vaigarai"} options={[{ value: "vaigarai", label: "Vaigarai" }, { value: "manal", label: "Manal" }, { value: "kadal", label: "Kadal" }, { value: "andhi", label: "Andhi" }, { value: "thalir", label: "Thalir" }]} />
          </div>
          <div className={styles.languages}>
            <div className={styles.fieldset}>
              <TextField id={fid("detail.referenceTa")} name="detail.referenceTa" lang="ta" label="Tamil reference (BSI)" defaultValue={str("referenceTa")} error={err("detail.referenceTa")} maxLength={120} />
              <TextField multiline id={fid("detail.textTa")} name="detail.textTa" lang="ta" label="Tamil verse text (BSI)" defaultValue={str("textTa")} error={err("detail.textTa")} rows={4} maxLength={2000} />
            </div>
            <div className={styles.fieldset}>
              <TextField id={fid("detail.referenceEn")} name="detail.referenceEn" label="English reference (NKJV)" defaultValue={str("referenceEn")} error={err("detail.referenceEn")} maxLength={120} />
              <TextField multiline id={fid("detail.textEn")} name="detail.textEn" label="English verse text (NKJV)" defaultValue={str("textEn")} error={err("detail.textEn")} rows={4} maxLength={2000} />
            </div>
          </div>
        </Surface>
      );
    default:
      return null;
  }
}
