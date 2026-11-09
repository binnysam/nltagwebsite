import { notFound } from "next/navigation";

/**
 * Any deeper unknown address under /{locale}/{slug}/… gets the site's own bilingual 404
 * (src/app/[locale]/not-found.tsx) instead of the framework default. Nothing is rendered here.
 */
export default function UnknownDeepPath(): never {
  notFound();
}
