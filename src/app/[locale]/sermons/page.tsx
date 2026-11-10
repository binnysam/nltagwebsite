import type { Metadata } from "next";
import { Button, ButtonLink, SelectField, TextField } from "@/design-system/components";
import { Container, Section } from "@/design-system/primitives";
import { t, type Locale } from "@/content/ui-strings";
import { filterSermons, listQuery, paginate, readSermonFilter, SERMONS_PAGE_SIZE, speakersOf } from "@/lib/listing";
import { loadSermons } from "@/server/cms/public-site";
import { Pagination } from "../_components/Pagination";
import { PublicShell } from "../_components/PublicShell";
import { SermonEntries, PageHead } from "../_components/sections";
import { href, pageMetadata, routeLabel } from "../_components/site";
import styles from "../public.module.css";
import { listDescription } from "@/content/seo";

type Props = { params: Promise<{ locale: Locale }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata(locale, "sermons", { description: listDescription(locale, "sermons") });
}

/**
 * Sermons: published sermon records, newest first, 10 per page. Search (title, summary, text,
 * speaker, Bible reference) and the speaker filter are a plain GET form, so they work without
 * JavaScript and every result page has its own address. Video is linked, never re-hosted.
 */
export default async function SermonsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const sp = await searchParams;
  const all = await loadSermons(locale);
  const filter = readSermonFilter(sp);
  const speakers = speakersOf(all, locale);
  const { items, page, totalPages } = paginate(filterSermons(all, filter, locale), sp.page, SERMONS_PAGE_SIZE);
  const filtered = Boolean(filter.q || filter.speaker);
  const base = href(locale, "sermons");
  return (
    <PublicShell locale={locale} route="sermons">
      <PageHead title={routeLabel(locale, "sermons")} />
      <Container>
        <Section aria-label={routeLabel(locale, "sermons")}>
          {all.length ? (
            <form method="get" action={base} role="search" aria-label={t("sermon.search", locale)} className={speakers.length > 1 ? styles.filters : styles.filtersNarrow}>
              <TextField id="sermon-q" name="q" type="search" label={t("sermon.search", locale)} defaultValue={filter.q} maxLength={100} />
              {speakers.length > 1 ? (
                <SelectField
                  id="sermon-speaker"
                  name="speaker"
                  label={t("sermon.speaker", locale)}
                  defaultValue={speakers.includes(filter.speaker) ? filter.speaker : ""}
                  options={[{ value: "", label: t("filter.allSpeakers", locale) }, ...speakers.map((s) => ({ value: s, label: s }))]}
                />
              ) : null}
              <div className={styles.filterActions}>
                <Button type="submit" variant="secondary">{t("filter.submit", locale)}</Button>
                {filtered ? <ButtonLink href={base} variant="tertiary">{t("filter.clear", locale)}</ButtonLink> : null}
              </div>
            </form>
          ) : null}
          <SermonEntries items={items} locale={locale} full emptyText={filtered ? t("filter.noResults", locale) : undefined} />
          <Pagination locale={locale} page={page} totalPages={totalPages} hrefFor={(p) => `${base}${listQuery(filter, p)}`} />
        </Section>
      </Container>
    </PublicShell>
  );
}
