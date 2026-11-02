import { Surface, Text } from "@/design-system/primitives";
import { listItems } from "@/server/cms/service";
import { requireStaffPage } from "../_lib/staff";
import { AdminShell } from "../_components/AdminShell";
import { ContentList } from "../_components/ContentList";
import { PageHead } from "../_components/parts";

export const metadata = { title: "Waiting for review" };

export default async function ReviewPage() {
  const ctx = await requireStaffPage();
  const rows = await listItems(ctx, null, { status: "IN_REVIEW" });
  return (
    <AdminShell ctx={ctx}>
      <PageHead title="Waiting for review" lead="Content submitted by editors. Open an item to preview, publish or return it to draft." back={{ href: "/admin", label: "Dashboard" }} />
      {rows.length ? <ContentList rows={rows} caption="Content waiting for review" showType /> : <Surface><Text>Nothing is waiting for review.</Text></Surface>}
    </AdminShell>
  );
}
