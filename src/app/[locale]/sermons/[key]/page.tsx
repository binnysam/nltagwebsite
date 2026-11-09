import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ButtonLink } from "@/design-system/components";
import { Container, Section, Text } from "@/design-system/primitives";
import { t, type Locale } from "@/content/ui-strings";
import { loadSermon } from "@/server/cms/public-site";
import { PublicShell } from "../../_components/PublicShell";
import { ShareButton } from "../../_components/ShareButton.client";
import { VideoEmbed } from "../../_components/VideoEmbed.client";
import { youTubeId } from "@/lib/youtube";
import { PageBody, PageHead, sermonMeta } from "../../_components/sections";
import { detailHref, href, itemKey, pageMetadata, routeLabel } from "../../_components/site";
import styles from "../../public.module.css";

/** Sermon keys are open-ended (CMS slugs and ids). */
export const dynamicParams = true;

type Props = { params: Promise<{ locale: Locale; key: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, key } = await params;
  const s = await loadSermon(locale, key);
  if (!s) return { robots: { index: false, follow: false } };
  return pageMetadata(locale, "sermons", { title: s.title, description: s.summary || sermonMeta(s, locale), path: `/sermons/${itemKey(s)}` });
}

/**
 * One sermon: title, date · speaker · Bible reference, the church's text, then for YouTube links a
 * click-to-load player (nothing loads from YouTube before the visitor presses play; video is never
 * re-hosted), "Watch the sermon" (the link itself, always present), Share and back to the list.
 * Same visibility rules as the list: unpublished, out-of-window or untitled-in-this-language is 404.
 */
export default async function SermonPage({ params }: Props) {
  const { locale, key } = await params;
  const s = await loadSermon(locale, key);
  if (!s) notFound();
  const meta = sermonMeta(s, locale);
  return (
    <PublicShell locale={locale} route="sermons" currentPath={href(locale, "sermons")}>
      <PageHead title={s.title} lead={s.summary || undefined} />
      <Container>
        <Section aria-label={s.title} className={styles.detail}>
          {meta ? <Text variant="small" tone="secondary" data-sermon-meta="">{meta}</Text> : null}
          {youTubeId(s.videoUrl) ? (
            <VideoEmbed id={youTubeId(s.videoUrl)!} title={s.title} playLabel={t("video.play", locale)} notice={t("video.notice", locale)} />
          ) : null}
          <PageBody item={s} />
          <div className={styles.actions}>
            {s.videoUrl ? <ButtonLink href={s.videoUrl} rel="noopener noreferrer">{t("sermon.watch", locale)}</ButtonLink> : null}
            <ShareButton path={detailHref(locale, "sermons", s)} title={s.title} label={t("verse.share", locale)} copiedLabel={t("share.copied", locale)} />
            <ButtonLink href={href(locale, "sermons")} variant="secondary">{routeLabel(locale, "sermons")}</ButtonLink>
          </div>
        </Section>
      </Container>
    </PublicShell>
  );
}
