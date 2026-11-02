import { ConfirmButton, DataTable } from "@/design-system/components";
import { Heading, Surface, Text } from "@/design-system/primitives";
import { listStaff } from "@/server/cms/service";
import { revokeRoleAction } from "../actions";
import { requireStaffPage } from "../_lib/staff";
import { AdminShell } from "../_components/AdminShell";
import { GrantRoleForm } from "../_components/forms.client";
import { PageHead, ResultNotice, one } from "../_components/parts";
import styles from "../admin.module.css";

export const metadata = { title: "Staff and roles" };

const ROLE_NAME = { CHURCH_ADMIN: "Church Admin", CONTENT_EDITOR: "Content Editor" } as const;

/** Church Admin only (staff.manage). Shows staff accounts only, never members. */
export default async function StaffPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireStaffPage("staff.manage");
  const sp = await searchParams;
  const staff = await listStaff(ctx);
  return (
    <AdminShell ctx={ctx}>
      <PageHead title="Staff and roles" lead="Who can use the admin. The person must have a verified account first. You cannot change your own roles, and the last Church Admin cannot be removed." />
      <ResultNotice done={one(sp.done)} error={one(sp.error)} />
      <DataTable caption="Staff accounts" captionHidden>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Email</th>
            <th scope="col">Roles</th>
          </tr>
        </thead>
        <tbody>
          {staff.map((s) => (
            <tr key={s.userId}>
              <th scope="row">{s.name}</th>
              <td>{s.email}</td>
              <td>
                <div className={styles.workflow}>
                  {s.roles.map((r) => (
                    <span key={r} className={styles.workflow}>
                      <span>{ROLE_NAME[r]}</span>
                      {s.userId !== ctx.actor.userId ? (
                        <form action={revokeRoleAction}>
                          <input type="hidden" name="userId" value={s.userId} />
                          <input type="hidden" name="role" value={r} />
                          <ConfirmButton label="Remove" compact variant="tertiary" title={`Remove ${ROLE_NAME[r]}?`} message={<p>{s.name} loses this role on their next page load.</p>} confirmLabel="Remove role" />
                        </form>
                      ) : null}
                    </span>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
      <section className={styles.section} aria-labelledby="grant-h">
        <Heading level={2} styleAs="h3" id="grant-h">Grant a role</Heading>
        <Text variant="small" tone="secondary" measure>Content Editors write and submit content. Church Admins also publish, manage staff and read the audit log.</Text>
        <Surface><GrantRoleForm /></Surface>
      </section>
    </AdminShell>
  );
}
