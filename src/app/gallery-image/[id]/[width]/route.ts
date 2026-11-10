import { formsMode } from "@/server/forms/mode";
import { formsViewer } from "@/server/forms/viewer";
import { publicVariant } from "@/server/gallery/service";

/**
 * Public gallery image: GET /gallery-image/{photoId}/{480|960|1600}. Serves only the resized,
 * metadata-free WebP copy of a published photo with recorded permission (src/server/gallery);
 * anything else is the same 404 as "does not exist". Originals are never served here.
 * Staff-only mode (NLTAG_PUBLIC_FORMS=staff, staging): signed-in staff only, never cached publicly.
 */
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function GET(req: Request, { params }: { params: Promise<{ id: string; width: string }> }) {
  const { id, width } = await params;
  const w = Number(width);
  const notFound = () => new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  if (!UUID.test(id) || !/^\d{3,4}$/.test(width)) return notFound();
  const bytes = await publicVariant(id, w, await formsViewer(req.headers));
  if (!bytes) return notFound();
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": "image/webp",
      // Short public cache: unpublishing or withdrawing permission takes effect within minutes.
      "cache-control": formsMode() === "staff" ? "private, no-store" : "public, max-age=300",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cross-origin-resource-policy": "same-origin",
    },
  });
}
