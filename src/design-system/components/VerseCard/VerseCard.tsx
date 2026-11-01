import type { ReactNode } from "react";
import type { Locale } from "@/content/ui-strings";
import { t } from "@/content/ui-strings";
import type { VerseRecord } from "@/content/bible";
import { cx } from "@/lib/cx";
import { GradientSurface, type GradientPreset } from "../GradientSurface";
import styles from "./verse-card.module.css";

export type VerseComposition = "editorial" | "split";
export type VerseVariant = "landscape" | "compact" | "square" | "portrait";
export type VerseLanguages = "both" | "ta" | "en";

export interface VerseCardProps {
  /** Church-approved record, the placeholder record, or null for the designed fallback. */
  verse: VerseRecord | null;
  /** Interface language (labels, fallback text). Verse text always shows Tamil first. */
  locale: Locale;
  /** Already-formatted Asia/Kuwait date, e.g. "1 நவம்பர் 2026". */
  dateLabel: string;
  composition?: VerseComposition;
  variant?: VerseVariant;
  languages?: VerseLanguages;
  preset?: GradientPreset;
  /** Shows the 64px safe-margin guide (preview only; never exported). */
  showExportGuide?: boolean;
  /** id of the card node, used by the Phase 5 PNG exporter. */
  id?: string;
}

/**
 * Bible Verse Showcase Card — NLTAG signature component (Phase 1 §7).
 * A <figure>: Tamil verse first, English beneath, reference/translation/credit in the caption.
 * Never renders invented Scripture: text comes only from the record passed in.
 */
export function VerseCard({
  verse,
  locale,
  dateLabel,
  composition = "editorial",
  variant = "compact",
  languages = "both",
  preset = "vaigarai",
  showExportGuide = false,
  id,
}: VerseCardProps) {
  const showTa = languages !== "en";
  const showEn = languages !== "ta";
  const social = variant === "square" || variant === "portrait";

  const taPane =
    showTa && verse?.text.ta ? (
      <blockquote className={styles.pane} lang="ta">
        <p className={styles.textTa}>{verse.text.ta}</p>
      </blockquote>
    ) : null;
  const enPane =
    showEn && verse?.text.en ? (
      <blockquote className={styles.pane} lang="en">
        <p className={styles.textEn}>{verse.text.en}</p>
      </blockquote>
    ) : null;

  let body: ReactNode;
  if (!verse) {
    body = <p className={styles.fallback} lang={locale}>{t("verse.fallback", locale)}</p>;
  } else {
    body = (
      <div className={styles.body}>
        {taPane}
        {taPane && enPane ? <hr className={styles.rule} aria-hidden="true" /> : null}
        {enPane}
      </div>
    );
  }

  const translationLine = verse
    ? [showTa ? verse.translation.ta : null, showEn ? verse.translation.en : null].filter(Boolean).join(" · ")
    : null;
  const referenceText = verse ? (locale === "ta" ? verse.reference.ta : verse.reference.en) : null;

  return (
    <div className={styles.frame}>
      <GradientSurface
        as="figure"
        preset={preset}
        id={id}
        data-verse-card=""
        data-variant={variant}
        data-composition={composition}
        aria-label={t("verse.today", locale)}
        className={cx(styles.card, styles[variant], composition === "split" && styles.split)}
      >
        <div className={styles.top}>
          <span className={styles.brand}>
            <span lang="en">NLTAG</span>
            <span aria-hidden="true">·</span>
            <span>{t("verse.today", locale)}</span>
          </span>
          {verse?.isPlaceholder ? <span className={styles.chip}>{t("verse.placeholderChip", locale)}</span> : null}
        </div>

        {body}

        <figcaption className={styles.meta}>
          {verse ? (
            <>
              <span>
                <span className={styles.reference}>{referenceText}</span>
                {translationLine ? <span lang="en"> · {translationLine}</span> : null}
              </span>
              <span>{verse.publisherCredit}</span>
            </>
          ) : null}
          <time>{dateLabel}</time>
        </figcaption>

        {showExportGuide && social ? <span className={styles.exportGuide} aria-hidden="true" data-export-ignore="" /> : null}
      </GradientSurface>
    </div>
  );
}

/** Share / Download PNG actions. Rendered outside the card node so they are never exported. */
export function VerseCardActions({ children }: { children: ReactNode }) {
  return <div className={styles.actions}>{children}</div>;
}
