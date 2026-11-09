import type { ReactNode } from "react";
import { ButtonLink, EntryList, SectionIntro, SpecialMeetingCard, VerseCard, gradientPresets, type Entry, type GradientPreset } from "@/design-system/components";
import { Container, Heading, Section, Text } from "@/design-system/primitives";
import { t, type Locale } from "@/content/ui-strings";
import { formatWhen, schedule, venueLabel } from "@/content/schedule";
import { placeholderVerse, translationLabels, type VerseRecord } from "@/content/bible";
import { formatDateKey, formatKuwaitDate, formatKuwaitMeetingTime } from "@/lib/date";
import { Markdown } from "@/lib/markdown";
import type { PublicItem, PublicMinistry, PublicSermon, PublicTestimony, PublicVerse } from "@/server/cms/public";
import type { BilingualMeeting } from "@/server/cms/public-site";
import { detailHref, href, type PublicRoute } from "./site";
import styles from "../public.module.css";

/**
 * Public section renderers (Phase 5). Shared by the homepage and the dedicated pages so each kind
 * of content looks the same everywhere. Content comes only from published CMS records or the
 * Gate 0 schedule; when nothing is published a section shows its designed empty line.
 */

type L = Locale;

/** Section wrapper: SectionIntro + content. `level` 2 on the homepage, 2 under a page h1 too. */
export function PublicSection({ id, title, lead, action, children }: { id: string; title: string; lead?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Container>
      <Section id={id} aria-labelledby={`${id}-title`}>
        <SectionIntro headingId={`${id}-title`} title={title} lead={lead || undefined} action={action} />
        {children}
      </Section>
    </Container>
  );
}

export function Empty({ locale, text }: { locale: L; text?: string }) {
  return <p className={styles.empty} data-empty-state="">{text ?? t("section.comingSoon", locale)}</p>;
}

export function ViewAll({ locale, route }: { locale: L; route: PublicRoute }) {
  return <ButtonLink href={href(locale, route)} variant="secondary">{t("action.viewAll", locale)}</ButtonLink>;
}

const body = (item: { summary: string; bodyMd: string }, full: boolean) =>
  full && item.bodyMd ? (
    <Markdown source={item.bodyMd} className={styles.prose} headingLevel={4} />
  ) : item.summary ? (
    <p>{item.summary}</p>
  ) : item.bodyMd ? (
    <Markdown source={item.bodyMd} className={styles.prose} headingLevel={4} />
  ) : null;

/* ── Announcements ─────────────────────────────────────────────── */
export function AnnouncementEntries({ items, locale, full = false }: { items: PublicItem[]; locale: L; full?: boolean }) {
  if (!items.length) return <Empty locale={locale} />;
  const entries: Entry[] = items.map((a) => ({
    id: a.id,
    title: a.title,
    meta: a.publishedAt ? formatKuwaitDate(a.publishedAt, locale) : undefined,
    children: body(a, full),
  }));
  return <EntryList entries={entries} label={t("section.announcements", locale)} />;
}

/* ── Special meetings ──────────────────────────────────────────── */
function meetingVenue(m: BilingualMeeting, locale: L): string {
  switch (m.locationKind) {
    case "NECK": return venueLabel("neck", locale);
    case "MEMBERS_HOMES": return venueLabel("members-homes", locale);
    case "OTHER": return m.locationText || t("special.location.tba", locale);
    default: return t("special.location.tba", locale);
  }
}

export function MeetingCards({ items, locale, limit }: { items: BilingualMeeting[]; locale: L; limit?: number }) {
  if (!items.length) return <Empty locale={locale} text={t("special.empty", locale)} />;
  const shown = limit ? items.slice(0, limit) : items;
  return (
    <ul className={styles.cards} role="list" aria-label={t("section.specialMeetings", locale)}>
      {shown.map((m, i) => {
        const own = m[locale] ?? m[locale === "ta" ? "en" : "ta"];
        return (
          <li key={m.id} data-meeting-id={m.id}>
            <SpecialMeetingCard
              preset={gradientPresets[i % gradientPresets.length] as GradientPreset}
              typeLabel={t("special.typeLabel", locale)}
              dateLabel={formatKuwaitMeetingTime(m.startsAt, locale)}
              dateTime={m.startsAt.toISOString()}
              titleTa={m.ta?.title ?? ""}
              titleEn={m.en?.title ?? ""}
              primary={locale}
              location={meetingVenue(m, locale)}
              announcement={own?.summary || undefined}
            />
          </li>
        );
      })}
    </ul>
  );
}

/* ── Sermons ───────────────────────────────────────────────────── */
/** Date · speaker · Bible reference, as one meta line. */
export const sermonMeta = (s: PublicSermon, locale: L) =>
  [s.sermonDate ? formatDateKey(s.sermonDate, locale) : "", s.speaker, s.bibleReference].filter(Boolean).join(" · ");

export function SermonEntries({ items, locale, limit, full = false, emptyText }: { items: PublicSermon[]; locale: L; limit?: number; full?: boolean; emptyText?: string }) {
  if (!items.length) return <Empty locale={locale} text={emptyText} />;
  const entries: Entry[] = (limit ? items.slice(0, limit) : items).map((s) => {
    const meta = sermonMeta(s, locale);
    return {
      id: s.id,
      title: s.title,
      href: detailHref(locale, "sermons", s),
      meta: meta || undefined,
      children: body(s, full),
      action: s.videoUrl ? (
        <a className={styles.inlineLink} href={s.videoUrl} rel="noopener noreferrer">{t("sermon.watch", locale)}</a>
      ) : undefined,
    };
  });
  return <EntryList entries={entries} label={t("nav.sermons", locale)} />;
}

/* ── Ministries ────────────────────────────────────────────────── */
export function MinistryEntries({ items, locale, limit, full = false }: { items: PublicMinistry[]; locale: L; limit?: number; full?: boolean }) {
  if (!items.length) return <Empty locale={locale} />;
  const entries: Entry[] = (limit ? items.slice(0, limit) : items).map((m) => ({
    id: m.id,
    title: m.title,
    children: (
      <>
        {body(m, full)}
        {m.contact ? <p className={styles.note}><span className={styles.factLabel}>{t("ministry.contact", locale)}: </span>{m.contact}</p> : null}
      </>
    ),
  }));
  return <EntryList entries={entries} label={t("nav.ministries", locale)} />;
}

/* ── Testimonies ───────────────────────────────────────────────── */
export function TestimonyEntries({ items, locale, limit, full = false }: { items: PublicTestimony[]; locale: L; limit?: number; full?: boolean }) {
  if (!items.length) return <Empty locale={locale} />;
  const entries: Entry[] = (limit ? items.slice(0, limit) : items).map((x) => ({
    id: x.id,
    title: x.title,
    href: detailHref(locale, "testimonies", x),
    meta: x.author ?? t("testimony.anonymous", locale),
    children: body(x, full),
  }));
  return <EntryList entries={entries} label={t("nav.testimonies", locale)} />;
}

/* ── Bible verse showcase ──────────────────────────────────────── */
/**
 * Maps the public verse DTO to the card record. Verse wording appears only for translations whose
 * permission is Verified (enforced in public.ts); otherwise the card shows the approved placeholder.
 */
export function toVerseRecord(v: PublicVerse | null, locale: L): VerseRecord | null {
  if (!v) return null;
  const ta = v.translations.find((x) => x.locale === "ta");
  const en = v.translations.find((x) => x.locale === "en");
  const hasText = Boolean(ta?.text || en?.text);
  if (!hasText) {
    const p = placeholderVerse(locale);
    return { ...p, id: v.id, reference: { ta: ta?.reference || p.reference.ta, en: en?.reference || p.reference.en } };
  }
  const credits = [ta?.text ? ta.creditLine : "", en?.text ? en.creditLine : ""].filter(Boolean).join(" · ");
  return {
    id: v.id,
    reference: { ta: ta?.reference || en?.reference || "", en: en?.reference || ta?.reference || "" },
    text: { ...(ta?.text ? { ta: ta.text } : {}), ...(en?.text ? { en: en.text } : {}) },
    translation: { ta: ta?.name || translationLabels.ta, en: en?.name || translationLabels.en },
    publisherCredit: credits,
    isPlaceholder: false,
  };
}

const presetOf = (p: string | undefined): GradientPreset => ((gradientPresets as readonly string[]).includes(p ?? "") ? (p as GradientPreset) : "vaigarai");

export function VerseShowcase({ verse, locale, now }: { verse: PublicVerse | null; locale: L; now: Date }) {
  const record = toVerseRecord(verse, locale);
  return (
    <div className={styles.verse}>
      <VerseCard
        verse={record}
        locale={locale}
        dateLabel={formatKuwaitDate(now, locale)}
        variant={verse?.cardVariant === "landscape" ? "landscape" : "compact"}
        preset={presetOf(verse?.preset)}
        id="todays-verse"
      />
    </div>
  );
}

/* ── Visit facts (Gate 0 only: NECK, Friday main worship; no address) ── */
export function VisitFacts({ locale }: { locale: L }) {
  const main = schedule.find((s) => s.id === "main-worship")!;
  return (
    <dl className={styles.facts}>
      <div>
        <dt className={styles.factLabel}>{t("visit.where", locale)}</dt>
        <dd className={styles.factValue}>NECK</dd>
      </div>
      <div>
        <dt className={styles.factLabel}>{t("visit.when", locale)}</dt>
        <dd className={styles.factValue}>{formatWhen(main, locale)}</dd>
      </div>
    </dl>
  );
}

export function PageBody({ item }: { item: PublicItem | null }) {
  if (!item?.bodyMd) return null;
  return <Markdown source={item.bodyMd} className={styles.prose} />;
}

export function Lead({ children }: { children: ReactNode }) {
  return <Text variant="body-l" tone="secondary" measure>{children}</Text>;
}

/** Page title block for dedicated pages: one h1 (display-l), optional lead. */
export function PageHead({ title, lead, lang }: { title: string; lead?: string; lang?: string }) {
  return (
    <Container className={styles.pageHead}>
      <Heading level={1} styleAs="display-l" lang={lang}>{title}</Heading>
      {lead ? <div className={styles.note}><Lead>{lead}</Lead></div> : null}
    </Container>
  );
}
