import { headers } from "next/headers";
import { accountsEnabled } from "@/server/accounts-gate";
import { clientIp, getCurrentUser } from "@/server/auth/session";
import { getMediaForStaff } from "@/server/cms/service";

/**
 * Staff-only image bytes for the admin (previews and the media library). Never cached publicly.
 * Public image serving arrives with the public content pages.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });
  const { id } = await params;
  if (!accountsEnabled() || !/^[0-9a-f-]{36}$/.test(id)) return notFound();
  const h = await headers();
  const me = await getCurrentUser(h);
  if (!me) return notFound();
  try {
    const asset = await getMediaForStaff({ actor: me, ip: clientIp(h) }, id);
    if (!asset) return notFound();
    return new Response(new Uint8Array(asset.data), {
      headers: {
        "Content-Type": asset.mimeType,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Content-Disposition": "inline",
      },
    });
  } catch {
    return notFound();
  }
}
