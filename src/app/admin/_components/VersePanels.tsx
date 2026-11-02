import { Heading, Surface, Text } from "@/design-system/primitives";
import { kuwaitDateKey } from "@/lib/date";
import { can } from "@/server/policy/permissions";
import { listItems, listTranslations, listVerseSchedule, type Ctx } from "@/server/cms/service";
import { ScheduleVerseForm, TranslationPermissionForm } from "./forms.client";
import styles from "../admin.module.css";

/** Bible translations (permission status) and the daily verse schedule. Changes are Church Admin only. */
export async function VersePanels({ ctx }: { ctx: Ctx }) {
  const isAdmin = can(ctx.actor.principal, "content.publish");
  const today = kuwaitDateKey(new Date());
  const [translations, scheduled, verses] = await Promise.all([listTranslations(), listVerseSchedule(ctx, today), listItems(ctx, "VERSE", { status: "PUBLISHED" })]);
  const label = (id: string) => {
    const v = verses.find((x) => x.id === id);
    return v ? v.titleEn || v.titleTa : "(unpublished verse)";
  };
  return (
    <>
      <section className={styles.section} aria-labelledby="perm-h">
        <Heading level={2} styleAs="h3" id="perm-h">Translations and publishing permission</Heading>
        <Text variant="small" tone="secondary" measure>
          Verse text can be entered now, but the website shows it only after the publisher&apos;s permission is recorded here. Until then the public card shows the reference with a placeholder.
          {isAdmin ? "" : " Only a Church Admin can change these."}
        </Text>
        <div className={styles.twoCol}>
          {translations.map((t) => (
            <Surface key={t.id}>
              <TranslationPermissionForm
                canEdit={isAdmin}
                t={{ id: t.id as "bsi-ta" | "nkjv-en", name: t.name, publisher: t.publisher, creditLine: t.creditLine, permissionReference: t.permissionReference, verified: t.permissionStatus === "VERIFIED", downloadsAllowed: t.downloadsAllowed }}
              />
            </Surface>
          ))}
        </div>
      </section>
      <section className={styles.section} aria-labelledby="sched-h">
        <Heading level={2} styleAs="h3" id="sched-h">Daily verse schedule</Heading>
        <Text variant="small" tone="secondary" measure>
          Days without a scheduled verse use the automatic daily selection: the same published verse for everyone all day (Kuwait date).
        </Text>
        {scheduled.length ? (
          <Surface>
            <ul className={styles.plainList}>
              {scheduled.map((s) => (
                <li key={s.dateKey}>
                  <span className={styles.meta}>{s.dateKey}</span>
                  <span>{label(s.itemId)}</span>
                </li>
              ))}
            </ul>
          </Surface>
        ) : (
          <Surface><Text>No days scheduled. The automatic selection is in use.</Text></Surface>
        )}
        {isAdmin ? (
          <Surface>
            <ScheduleVerseForm defaultDate={today} verses={verses.map((v) => ({ id: v.id, label: v.titleEn || v.titleTa }))} />
          </Surface>
        ) : null}
      </section>
    </>
  );
}
