import type { ReactNode } from "react";
import Link from "next/link";
import { Container } from "@/design-system/primitives";
import { can } from "@/server/policy/permissions";
import type { Ctx } from "@/server/cms/service";
import { MODULES } from "@/server/cms/registry";
import { publicFormsEnabled } from "@/server/forms/service";
import { AdminNav, type NavItem } from "./AdminNav.client";
import styles from "../admin.module.css";

/** Navigation follows the role: staff and audit links appear only for Church Admins (and are enforced on the server). */
export function navFor(ctx: Ctx): NavItem[] {
  const p = ctx.actor.principal;
  const cms = can(p, "admin.access");
  const forms = publicFormsEnabled();
  return [
    ...(cms ? [{ href: "/admin", label: "Dashboard" }] : []),
    ...(forms && can(p, "prayer.read") ? [{ href: "/admin/prayer", label: "Prayer requests" }] : []),
    ...(forms && can(p, "contact.read") ? [{ href: "/admin/contact", label: "Contact messages" }] : []),
    ...(forms && can(p, "submission.read") ? [{ href: "/admin/testimony-submissions", label: "Testimony submissions" }] : []),
    ...(cms ? MODULES.map((m) => ({ href: `/admin/${m.segment}`, label: m.label })) : []),
    ...(cms ? [{ href: "/admin/media", label: "Media" }] : []),
    ...(forms && cms && can(p, "media.upload") ? [{ href: "/admin/gallery", label: "Gallery" }] : []),
    ...(can(p, "staff.manage") ? [{ href: "/admin/staff", label: "Staff and roles" }] : []),
    ...(can(p, "audit.read") ? [{ href: "/admin/audit", label: "Audit log" }] : []),
  ];
}

export function AdminShell({ ctx, children }: { ctx: Ctx; children: ReactNode }) {
  const roles = ctx.actor.principal.roles;
  const role = roles.includes("CHURCH_ADMIN") ? "Church Admin" : roles.includes("CONTENT_EDITOR") ? "Content Editor" : "Prayer Team";
  const nav = navFor(ctx);
  return (
    <>
      <a href="#main" className="ds-skip-link">Skip to content</a>
      <header className={styles.topbar}>
        <Container wide className={styles.topbarInner}>
          <Link href={can(ctx.actor.principal, "admin.access") ? "/admin" : "/admin/prayer"} className={styles.wordmark}>
            NLTAG <span className={styles.wordmarkSub}>Admin</span>
          </Link>
          <div className={styles.who}>
            <span className={styles.whoText}>
              {ctx.actor.name} · {role}
            </span>
            <Link href="/en/account" className={styles.topLink}>Account</Link>
            <Link href="/ta" className={styles.topLink}>View site</Link>
          </div>
        </Container>
      </header>
      <Container wide className={styles.frame}>
        <AdminNav items={nav} />
        <main id="main" className={styles.main} tabIndex={-1}>
          {children}
        </main>
      </Container>
    </>
  );
}
