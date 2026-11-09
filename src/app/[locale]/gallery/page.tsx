import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container, Section } from "@/design-system/primitives";
import { t, type Locale } from "@/content/ui-strings";
import { listPublicGallery } from "@/server/gallery/service";
import { publicFormsEnabled } from "@/server/forms/service";
import { PublicShell } from "../_components/PublicShell";
import { Empty, PageHead } from "../_components/sections";
import { Pagination } from "../_components/Pagination";
import { href, pageMetadata, routeLabel } from "../_components/site";
import styles from "./gallery.module.css";

type Props = { params: Promise<{ locale: Locale }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata(locale, "gallery", { description: t("gallery.lead", locale) });
}

/**
 * Public gallery: published photos with recorded permission only, as resized metadata-free copies
 * (src/server/gallery). Captions are the image descriptions. Static grid; no animation.
 */
export default async function GalleryPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!publicFormsEnabled()) notFound(); // needs migration 0004 (switch NLTAG_PUBLIC_FORMS)
  const sp = await searchParams;
  const page = Number(Array.isArray(sp.page) ? sp.page[0] : sp.page) || 1;
  const data = await listPublicGallery(locale, page);
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  if (page > pages) notFound();
  return (
    <PublicShell locale={locale} route="gallery">
      <PageHead title={routeLabel(locale, "gallery")} lead={t("gallery.lead", locale)} />
      <Container>
        <Section aria-label={routeLabel(locale, "gallery")}>
          {data.photos.length === 0 ? (
            <Empty locale={locale} text={t("gallery.empty", locale)} />
          ) : (
            <ul className={styles.grid}>
              {data.photos.map((p) => (
                <li key={p.id} className={styles.item}>
                  <figure className={styles.figure}>
                    <a href={`/gallery-image/${p.id}/1600`} className={styles.link}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- our own resized copies; srcset below */}
                      <img
                        src={`/gallery-image/${p.id}/${p.widths.includes(960) ? 960 : p.widths[0]}`}
                        srcSet={p.widths.map((w) => `/gallery-image/${p.id}/${w} ${w}w`).join(", ")}
                        sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw" // token-audit-ignore: the HTML sizes attribute needs literal media queries; they match the grid breakpoints in gallery.module.css
                        alt={p.caption}
                        width={p.width}
                        height={p.height}
                        loading="lazy"
                        decoding="async"
                        className={styles.image}
                      />
                    </a>
                    {p.caption ? <figcaption className={styles.caption}>{p.caption}</figcaption> : null}
                  </figure>
                </li>
              ))}
            </ul>
          )}
          <Pagination locale={locale} page={page} totalPages={pages} hrefFor={(n) => (n === 1 ? href(locale, "gallery") : `${href(locale, "gallery")}?page=${n}`)} />
        </Section>
      </Container>
    </PublicShell>
  );
}
