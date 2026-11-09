import Link from "next/link";
import { ButtonLink, DataTable } from "@/design-system/components";
import { Heading, Surface, Text } from "@/design-system/primitives";
import { schedule } from "@/content/schedule";
import { upcomingOccurrences } from "@/lib/schedule-occurrences";
import { can } from "@/server/policy/permissions";
import { MODULES, moduleByType } from "@/server/cms/registry";
import { dashboard } from "@/server/cms/service";
import { inboxCounts } from "@/server/forms/service";
import { redirect } from "next/navigation";
import { titlePrefix } from "@/server/deployment/environment";
import { requireStaffPage } from "./_lib/staff";
import { AdminShell } from "./_components/AdminShell";
import { PageHead, StatusTag, Titles, when } from "./_components/parts";
import styles from "./admin.module.css";

// The layout's title template does not apply to a page in its own segment: spell it out.
export const metadata = { title: { absolute: `${titlePrefix()}Dashboard · NLTAG Admin` } };

export default async function DashboardPage() {
  const ctx = await requireStaffPage("staff.portal");
  // Prayer Team has no CMS access: its landing page is the prayer inbox.
  if (!can(ctx.actor.principal, "admin.access")) redirect("/admin/prayer");
  const now = new Date();
  const data = await dashboard(ctx, now);
  const inbox = await inboxCounts(ctx);
  const regular = upcomingOccurrences(schedule, now, 7);
  const nameOf = (id: string) => schedule.find((s) => s.id === id)?.name.en ?? id;
  const isAdmin = can(ctx.actor.principal, "content.publish");
  // Regular meetings for the next 7 days and the next special meetings, in time order.
  const upcoming = [
    ...regular.map((o) => ({ kind: "regular" as const, key: `${o.itemId}-${o.startsAt.toISOString()}`, startsAt: o.startsAt, name: nameOf(o.itemId) })),
    ...data.upcomingSpecial.map((r) => ({ kind: "special" as const, key: r.id, startsAt: r.startsAt!, row: r })),
  ].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  const stats = [
    { label: "Published", value: data.totals.published },
    { label: "Scheduled", value: data.totals.scheduled },
    { label: "In review", value: data.totals.inReview },
    { label: "Drafts", value: data.totals.draft },
    ...(inbox.prayer !== undefined ? [{ label: "New prayer requests", value: inbox.prayer }] : []),
    ...(inbox.contact !== undefined ? [{ label: "New contact messages", value: inbox.contact }] : []),
    ...(inbox.testimony !== undefined ? [{ label: "New testimony submissions", value: inbox.testimony }] : []),
  ];

  return (
    <AdminShell ctx={ctx}>
      <PageHead
        title="Dashboard"
        lead={isAdmin ? "Everything waiting for you, and what is coming up. Times are Kuwait time." : "Your drafts and what is coming up. A Church Admin publishes submitted content. Times are Kuwait time."}
      />

      <section aria-labelledby="stats-h">
        <Heading level={2} styleAs="h3" id="stats-h" className="ds-visually-hidden">Content at a glance</Heading>
        <ul className={styles.stats} role="list">
          {stats.map((s) => (
            <li key={s.label}>
              <Surface className={styles.stat}>
                <span className={styles.statValue}>{s.value}</span>
                <span className={styles.statLabel}>{s.label}</span>
              </Surface>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="quick-h">
        <Heading level={2} styleAs="h3" id="quick-h">Quick actions</Heading>
        <div className={styles.workflow}>
          <ButtonLink href="/admin/announcements/new">New announcement</ButtonLink>
          <ButtonLink href="/admin/events/new" variant="secondary">New special meeting</ButtonLink>
          <ButtonLink href="/admin/sermons/new" variant="secondary">New sermon</ButtonLink>
          <ButtonLink href="/admin/pages/new" variant="secondary">New page</ButtonLink>
          {data.totals.inReview > 0 && isAdmin ? <ButtonLink href="/admin/review" variant="tertiary">Review submitted content</ButtonLink> : null}
        </div>
      </section>

      <div className={`${styles.twoCol} ${styles.section}`}>
        <section aria-labelledby="upcoming-h">
          <Surface className={styles.card}>
            <Heading level={2} styleAs="h3" id="upcoming-h">Coming up</Heading>
            {upcoming.length === 0 ? <Text>Nothing scheduled.</Text> : null}
            <ul className={styles.plainList}>
              {upcoming.map((u) =>
                u.kind === "regular" ? (
                  <li key={u.key}>
                    <span>{u.name}</span>
                    <span className={styles.meta}>{when(u.startsAt)}</span>
                  </li>
                ) : (
                  <li key={u.key}>
                    <Link className={styles.rowLink} href={`/admin/events/${u.row.id}`}>
                      <Titles ta={u.row.titleTa} en={u.row.titleEn} />
                    </Link>
                    <span className={styles.meta}>{when(u.startsAt)}</span>
                    <StatusTag item={u.row} now={now} />
                  </li>
                ),
              )}
            </ul>
            <Text variant="small" tone="secondary">Regular meetings for the next 7 days (approved Gate 0 schedule) and the next special meetings.</Text>
          </Surface>
        </section>

        <section>
          <DataTable caption="Content by type">
            <thead>
              <tr>
                <th scope="col">Type</th>
                <th scope="col">Published</th>
                <th scope="col">In review</th>
                <th scope="col">Drafts</th>
              </tr>
            </thead>
            <tbody>
              {MODULES.map((m) => {
                const c = data.counts[m.type];
                return (
                  <tr key={m.type}>
                    <th scope="row"><Link className={styles.rowLink} href={`/admin/${m.segment}`}>{m.label}</Link></th>
                    <td>{c?.PUBLISHED ?? 0}</td>
                    <td>{c?.IN_REVIEW ?? 0}</td>
                    <td>{c?.DRAFT ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        </section>
      </div>

      <section className={styles.section} aria-labelledby="recent-h">
        <Heading level={2} styleAs="h3" id="recent-h">Recent content activity</Heading>
        {data.recentContent.length === 0 ? (
          <Surface className={styles.empty}>
            <Text>No content yet. Start with an announcement or a page.</Text>
            <ButtonLink href="/admin/announcements/new" variant="secondary">New announcement</ButtonLink>
          </Surface>
        ) : (
          <DataTable caption="Recently changed content" captionHidden>
            <thead>
              <tr>
                <th scope="col">Title</th>
                <th scope="col">Type</th>
                <th scope="col">Status</th>
                <th scope="col">Last changed</th>
              </tr>
            </thead>
            <tbody>
              {data.recentContent.map((r) => (
                <tr key={r.id}>
                  <th scope="row">
                    <Link className={styles.rowLink} href={`/admin/${moduleByType(r.type).segment}/${r.id}`}><Titles ta={r.titleTa} en={r.titleEn} /></Link>
                  </th>
                  <td>{moduleByType(r.type).singular}</td>
                  <td><StatusTag item={r} now={now} /></td>
                  <td className={styles.meta}>{when(r.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </section>

      {data.adminActivity ? (
        <section className={styles.section} aria-labelledby="activity-h">
          <div className={styles.sectionHead}>
            <Heading level={2} styleAs="h3" id="activity-h">Recent administrative activity</Heading>
            <Link className={styles.rowLink} href="/admin/audit">Full audit log</Link>
          </div>
          <DataTable caption="Recent administrative activity" captionHidden>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Who</th>
                <th scope="col">Action</th>
                <th scope="col">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {data.adminActivity.map((a) => (
                <tr key={a.id}>
                  <td className={styles.meta}>{when(a.createdAt)}</td>
                  <td>{a.actorName ?? "System"}</td>
                  <td><code>{a.action}</code>{a.entity ? ` · ${a.entity}` : ""}</td>
                  <td>{a.outcome === "SUCCESS" ? "Success" : a.outcome === "DENIED" ? "Denied" : "Failed"}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </section>
      ) : null}
    </AdminShell>
  );
}
