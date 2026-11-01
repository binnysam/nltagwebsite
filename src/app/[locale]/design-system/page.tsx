import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  Button, ButtonLink, GradientSurface, IconButton, MembershipStatusBadge, ScheduleList, SectionIntro,
  SiteHeader, SpecialMeetingCard, StatusBadge, TextField, VerseCard, VerseCardActions, gradientPresets,
  type MembershipStatus,
} from "@/design-system/components";
import { Container, Heading, Icon, Text } from "@/design-system/primitives";
import { schedule } from "@/content/schedule";
import { placeholderVerse } from "@/content/bible";
import { t, type Locale } from "@/content/ui-strings";
import { formatKuwaitDate } from "@/lib/date";
import g from "./gallery.module.css";

export const metadata: Metadata = {
  title: "Design system",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Private component gallery for review and automated tests. Rendered only when
 * NLTAG_DESIGN_SYSTEM_GALLERY=1 (never set in production). Not linked from the site.
 */
export default async function DesignSystemGallery({ params }: { params: Promise<{ locale: Locale }> }) {
  if (process.env.NLTAG_DESIGN_SYSTEM_GALLERY !== "1") notFound();
  const { locale } = await params;
  const L = (key: Parameters<typeof t>[0]) => t(key, locale);
  // Fixed review date so screenshots are reproducible (1 Nov 2026, Kuwait).
  const date = formatKuwaitDate(new Date("2026-11-01T09:00:00+03:00"), locale);
  const verse = placeholderVerse(locale);
  const statuses: MembershipStatus[] = ["draft", "emailVerified", "pendingReview", "correctionRequested", "active", "rejected"];
  const required = `${L("form.required")}`;
  const navItems = [
    { href: "#foundations", label: L("nav.about") },
    { href: "#schedule", label: L("nav.worshipTimes") },
    { href: "#verse", label: L("nav.sermons") },
    { href: "#forms", label: L("nav.contact") },
  ];

  return (
    <>
      <SiteHeader locale={locale} navItems={navItems} cta={{ href: "#schedule", label: L("cta.joinFriday") }} />
      <main id="main">
        <Container className={g.page}>
          <p className={g.notice} lang="en">
            Private design-system gallery (Phase 2). Not indexed, not linked. Tamil wording is draft pending church review.
            Bracketed text marks content the church has not supplied.
          </p>
          <Heading level={1} styleAs="display-xl" lang="en">NLTAG Design System</Heading>

          {/* Foundations */}
          <section id="foundations" className={g.block} aria-labelledby="h-foundations">
            <Heading level={2} id="h-foundations" className={g.blockTitle} lang="en">Foundations</Heading>

            <Heading level={3} className={g.blockTitle} lang="en">Semantic colour</Heading>
            <div className={g.swatches}>
              {[
                "surface-page", "surface-card", "surface-subtle", "surface-sunken", "text-primary", "text-strong-secondary",
                "text-secondary", "border-control", "action-primary", "focus-ring", "status-success-text", "status-warning-text",
                "status-error-text", "status-info-text",
              ].map((name) => (
                <div key={name} className={g.swatch} lang="en">
                  <span className={g.chipColor} style={{ background: `var(--color-${name})` }} />
                  {name}
                </div>
              ))}
            </div>

            <Heading level={3} className={g.blockTitle} lang="en" style={{ marginTop: "var(--space-7)" }}>Type — Tamil</Heading>
            <div className={g.specimen} lang="ta">
              {(["display-xl", "display-l", "h1", "h2", "h3"] as const).map((s) => (
                <div key={s} className={g.specimenRow}>
                  <span className={g.tokenName} lang="en">{s}</span>
                  <Heading level={4} styleAs={s}>ஆராதனை அட்டவணை · ஸ்ரீ க்ஷ ஜ்ஞ கொ கோ கௌ</Heading>
                </div>
              ))}
              <div className={g.specimenRow}>
                <span className={g.tokenName} lang="en">body (17px / 1.8)</span>
                <Text measure>ஒவ்வொரு வெள்ளிக்கிழமை, காலை 7:30 – 9:30 · NECK. ழு ளு ற்று ஞ்ச ந்த ண்ட ஷ்ட · ௧௨௩௪௫</Text>
              </div>
            </div>

            <Heading level={3} className={g.blockTitle} lang="en" style={{ marginTop: "var(--space-7)" }}>Type — English</Heading>
            <div className={g.specimen} lang="en">
              {(["display-xl", "display-l", "h1", "h2", "h3"] as const).map((s) => (
                <div key={s} className={g.specimenRow}>
                  <span className={g.tokenName}>{s}</span>
                  <Heading level={4} styleAs={s}>Worship schedule</Heading>
                </div>
              ))}
              <div className={g.specimenRow}>
                <span className={g.tokenName}>body (16px / 1.6)</span>
                <Text measure>Every Friday, 7:30 – 9:30 AM at NECK. All times are Kuwait time.</Text>
              </div>
            </div>

            <Heading level={3} className={g.blockTitle} lang="en" style={{ marginTop: "var(--space-7)" }}>Space, radius, elevation</Heading>
            <div className={g.scale} lang="en">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <div key={n} className={g.swatch}>
                  <span className={g.space} style={{ width: `var(--space-${n})` }} />
                  space-{n}
                </div>
              ))}
            </div>
            <div className={g.scale} lang="en" style={{ marginTop: "var(--space-5)" }}>
              {["sm", "md", "lg", "xl", "pill"].map((r) => (
                <div key={r} className={g.swatch}>
                  <span className={g.radius} style={{ borderRadius: `var(--radius-${r})` }} />
                  radius-{r}
                </div>
              ))}
            </div>
            <div className={g.scale} lang="en" style={{ marginTop: "var(--space-5)" }}>
              {[1, 2, 3].map((n) => (
                <span key={n} className={g.elev} style={{ boxShadow: `var(--shadow-${n})` }}>shadow-{n}</span>
              ))}
            </div>

            <Heading level={3} className={g.blockTitle} lang="en" style={{ marginTop: "var(--space-7)" }}>Static gradient presets</Heading>
            <div className={g.presets}>
              {gradientPresets.map((p) => (
                <GradientSurface key={p} preset={p} className={g.preset}>
                  <Text variant="small" medium tone="on-gradient" lang="en">{p}</Text>
                </GradientSurface>
              ))}
            </div>
          </section>

          {/* Buttons */}
          <section id="buttons" className={g.block} aria-labelledby="h-buttons">
            <Heading level={2} id="h-buttons" className={g.blockTitle} lang="en">Buttons</Heading>
            {(["primary", "secondary", "tertiary"] as const).map((v) => (
              <div key={v} className={g.row} data-testid={`buttons-${v}`}>
                <span className={g.label} lang="en">{v}</span>
                <Button variant={v}>{L("cta.joinFriday")}</Button>
                <Button variant={v} compact>{L("verse.share")}</Button>
                <Button variant={v} loading loadingLabel={L("form.loading")}>{L("verse.download")}</Button>
                <Button variant={v} disabled>{L("verse.download")}</Button>
              </div>
            ))}
            <div className={g.row}>
              <span className={g.label} lang="en">link</span>
              <ButtonLink href={`/${locale}`}>{L("nav.home")}</ButtonLink>
              <IconButton label={L("nav.menu")} icon={<Icon name="menu" />} />
              <IconButton label={L("verse.share")} icon={<Icon name="share" />} variant="primary" />
            </div>
            <GradientSurface preset="vaigarai" className={g.gradientStage}>
              <div className={g.row} style={{ marginBottom: 0 }}>
                <span className={g.label} lang="en">glass (over gradients only)</span>
                <Button variant="glass">{L("nav.worshipTimes")}</Button>
                <IconButton variant="glass" label={L("hero.pause")} icon={<Icon name="pause" size="small" />} />
              </div>
            </GradientSurface>
          </section>

          {/* Forms */}
          <section id="forms" className={g.block} aria-labelledby="h-forms">
            <Heading level={2} id="h-forms" className={g.blockTitle} lang="en">Form fields and status</Heading>
            <div className={g.fields}>
              <TextField id="f-default" label="[Field label]" placeholder="" />
              <TextField id="f-hint" label="[Field label]" hint="[Hint text]" requirementText={required} required />
              <TextField id="f-error" label="[Field label]" requirementText={required} required error={L("form.errorRequired")} />
              <TextField id="f-disabled" label="[Field label]" disabled defaultValue="[Disabled value]" />
              <TextField id="f-readonly" label="[Field label]" readOnly defaultValue="[Read-only value]" />
              <TextField id="f-multi" label="[Message label]" multiline requirementText={L("form.optional")} />
            </div>
            <div className={g.row} style={{ marginTop: "var(--space-6)" }}>
              {statuses.map((s) => <MembershipStatusBadge key={s} status={s} locale={locale} />)}
            </div>
            <div className={g.row}>
              <StatusBadge tone="info">{L("schedule.timezone")}</StatusBadge>
            </div>
          </section>

          {/* Schedule */}
          <section id="schedule" className={g.block} aria-labelledby="h-schedule">
            <SectionIntro
              headingId="h-schedule"
              eyebrow={L("schedule.timezone")}
              title={L("schedule.heading")}
              action={<ButtonLink href="#schedule">{L("cta.joinFriday")}</ButtonLink>}
            />
            <ScheduleList items={schedule} locale={locale} />
          </section>

          {/* Verse card */}
          <section id="verse" className={g.block} aria-labelledby="h-verse">
            <Heading level={2} id="h-verse" className={g.blockTitle} lang="en">Bible Verse Showcase Card</Heading>
            <div className={g.verseGrid}>
              <div className={g.verseItem} data-testid="verse-compact">
                <span className={g.tokenName}>Editorial A · compact · Vaigarai</span>
                <VerseCard verse={verse} locale={locale} dateLabel={date} variant="compact" />
                <VerseCardActions>
                  <Button variant="secondary" compact icon={<Icon name="share" />}>{L("verse.share")}</Button>
                  <Button variant="secondary" compact icon={<Icon name="download" />}>{L("verse.download")}</Button>
                </VerseCardActions>
              </div>
              <div className={g.verseItem}>
                <span className={g.tokenName}>Editorial A · fallback (nothing scheduled)</span>
                <VerseCard verse={null} locale={locale} dateLabel={date} variant="compact" preset="thalir" />
              </div>
            </div>

            <div className={g.verseItem} style={{ marginTop: "var(--space-6)" }} data-testid="verse-landscape">
              <span className={g.tokenName}>Editorial A · landscape · Kadal</span>
              <VerseCard verse={verse} locale={locale} dateLabel={date} variant="landscape" preset="kadal" />
            </div>
            <div className={g.verseItem} style={{ marginTop: "var(--space-6)" }} data-testid="verse-split">
              <span className={g.tokenName}>Split C · landscape · Andhi</span>
              <VerseCard verse={verse} locale={locale} dateLabel={date} variant="landscape" composition="split" preset="andhi" />
            </div>

            <div className={g.verseGrid} style={{ marginTop: "var(--space-6)" }}>
              <div className={g.verseItem} data-testid="verse-square">
                <span className={g.tokenName}>Square 1080×1080 · export guide · Manal</span>
                <VerseCard verse={verse} locale={locale} dateLabel={date} variant="square" preset="manal" showExportGuide />
              </div>
              <div className={g.verseItem} data-testid="verse-portrait">
                <span className={g.tokenName}>Portrait 1080×1350 · Thalir</span>
                <VerseCard verse={verse} locale={locale} dateLabel={date} variant="portrait" preset="thalir" />
              </div>
              <div className={g.verseItem}>
                <span className={g.tokenName}>Tamil only</span>
                <VerseCard verse={verse} locale={locale} dateLabel={date} languages="ta" />
              </div>
              <div className={g.verseItem}>
                <span className={g.tokenName}>English only</span>
                <VerseCard verse={verse} locale={locale} dateLabel={date} languages="en" preset="kadal" />
              </div>
            </div>
          </section>

          {/* Special meeting */}
          <section id="meetings" className={g.block} aria-labelledby="h-meetings">
            <Heading level={2} id="h-meetings" className={g.blockTitle} lang="en">Special meeting card</Heading>
            <div className={g.meetings}>
              {(["manal", "kadal", "andhi"] as const).map((p) => (
                <SpecialMeetingCard
                  key={p}
                  preset={p}
                  typeLabel={t("special.typeLabel", "ta")}
                  dateLabel="[Date and time]"
                  dateTime="2026-11-01"
                  titleTa="[தலைப்பு — உள்ளடக்கம் தேவை]"
                  titleEn="[Title — content required]"
                  announcement="[Announcement text from the CMS]"
                  href="#meetings"
                />
              ))}
            </div>
          </section>
        </Container>
      </main>
    </>
  );
}
