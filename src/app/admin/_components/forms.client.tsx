"use client";

import { useActionState } from "react";
import { Button, CheckboxField, Notice, SelectField, TextField } from "@/design-system/components";
import { grantRoleAction, scheduleVerseAction, translationPermissionAction, uploadMediaAction } from "../actions";
import type { ActionState } from "../_lib/staff";
import styles from "../admin.module.css";
import { keepValues } from "./keep-values";

const initial: ActionState = { ok: false, message: "", seq: 0 };

function Result({ state }: { state: ActionState }) {
  if (!state.seq) return null;
  return <Notice tone={state.ok ? "success" : "error"} title={state.ok ? "Done" : "Not saved"}><p>{state.message}</p></Notice>;
}

export interface TranslationRow {
  id: "bsi-ta" | "nkjv-en";
  name: string;
  publisher: string;
  creditLine: string;
  permissionReference: string;
  verified: boolean;
  downloadsAllowed: boolean;
}

export function TranslationPermissionForm({ t, canEdit }: { t: TranslationRow; canEdit: boolean }) {
  const [state, action, pending] = useActionState(translationPermissionAction, initial);
  return (
    <form onSubmit={keepValues(action)} className={styles.card}>
      <input type="hidden" name="translationId" value={t.id} />
      <fieldset className={styles.fieldset} disabled={!canEdit}>
        <legend className={styles.legend}>{t.name}</legend>
        <p className={styles.meta}>Publisher: {t.publisher}</p>
        <TextField id={`${t.id}-credit`} name="creditLine" label="Exact credit line" hint="As required by the publisher's permission terms." defaultValue={t.creditLine} error={state.errors?.creditLine} />
        <TextField id={`${t.id}-ref`} name="permissionReference" label="Where the permission is documented" hint="For example a letter or email reference. No personal details." defaultValue={t.permissionReference} error={state.errors?.permissionReference} />
        <CheckboxField id={`${t.id}-verified`} name="verified" label="Publishing permission verified" defaultChecked={t.verified} hint="Until this is ticked, verse text in this translation is never shown on the website." />
        <CheckboxField id={`${t.id}-dl`} name="downloadsAllowed" label="Verse-card downloads allowed" defaultChecked={t.downloadsAllowed} hint="Only takes effect when permission is verified." />
      </fieldset>
      <Result state={state} />
      {canEdit ? <div><Button type="submit" variant="secondary" loading={pending} loadingLabel="Saving">Save permission</Button></div> : null}
    </form>
  );
}

export function ScheduleVerseForm({ verses, defaultDate }: { verses: { id: string; label: string }[]; defaultDate: string }) {
  const [state, action, pending] = useActionState(scheduleVerseAction, initial);
  return (
    <form onSubmit={keepValues(action)} className={styles.card}>
      <div className={styles.fieldGrid}>
        <TextField id="dateKey" name="dateKey" type="date" label="Date (Kuwait)" defaultValue={defaultDate} required error={state.errors?.dateKey} />
        <SelectField id="itemId" name="itemId" label="Verse" options={[{ value: "", label: "Automatic (daily selection)" }, ...verses.map((v) => ({ value: v.id, label: v.label }))]} />
      </div>
      <Result state={state} />
      <div><Button type="submit" variant="secondary" loading={pending} loadingLabel="Saving">Save schedule</Button></div>
    </form>
  );
}

export function MediaUploadForm() {
  const [state, action, pending] = useActionState(uploadMediaAction, initial);
  return (
    <form action={action} className={styles.card} key={state.ok ? state.seq : "form"}>
      <TextField id="file" name="file" type="file" label="Image" hint="JPEG, PNG or WebP, up to 2 MB. Only upload images the church has permission to use." accept="image/jpeg,image/png,image/webp" required error={state.errors?.file} />
      <div className={styles.fieldGrid}>
        <TextField id="altEn" name="altEn" label="Description (English)" hint="What the image shows, for people using screen readers." maxLength={300} />
        <TextField id="altTa" name="altTa" label="Description (Tamil)" lang="ta" maxLength={300} />
      </div>
      <Result state={state} />
      <div><Button type="submit" loading={pending} loadingLabel="Uploading">Upload image</Button></div>
    </form>
  );
}

export function GrantRoleForm({ prayerTeam = false }: { prayerTeam?: boolean } = {}) {
  const [state, action, pending] = useActionState(grantRoleAction, initial);
  return (
    <form onSubmit={keepValues(action)} className={styles.card}>
      <div className={styles.fieldGrid}>
        <TextField id="email" name="email" type="email" label="Email of a verified account" autoComplete="off" required error={state.errors?.email} />
        <SelectField id="role" name="role" label="Role" options={[{ value: "CONTENT_EDITOR", label: "Content Editor" }, ...(prayerTeam ? [{ value: "PRAYER_TEAM", label: "Prayer Team" }] : []), { value: "CHURCH_ADMIN", label: "Church Admin" }]} />
      </div>
      <Result state={state} />
      <div><Button type="submit" loading={pending} loadingLabel="Saving">Grant role</Button></div>
    </form>
  );
}
