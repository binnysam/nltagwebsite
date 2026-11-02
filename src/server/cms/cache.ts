import { revalidateTag } from "next/cache";

/** Cache tag for every published-content query. Any write that can change public output clears it. */
export const PUBLIC_CONTENT_TAG = "cms:published";

/**
 * Clears cached public content. Outside a Next.js request (scripts, tests) there is no cache to
 * clear and revalidateTag throws; that is safe to ignore.
 */
export function invalidatePublicContent() {
  try {
    // expire: 0 → removed or unpublished content disappears on the next request, not after a stale read.
    revalidateTag(PUBLIC_CONTENT_TAG, { expire: 0 });
  } catch {
    /* no Next.js cache in this context */
  }
}
