import { Notice } from "@/design-system/components";
import { deploymentKind } from "@/server/deployment/environment";
export { titlePrefix } from "@/server/deployment/environment";
import styles from "./environment-banner.module.css";

/**
 * Visible environment indicator (staging safety rule 12). Rendered at the top of every public and
 * admin page on the staging deployment only; production renders nothing. Reuses the design-system
 * Notice (warning tone). English only on purpose: it is an operator label, never shown on the live
 * site, so it is not a public interface string for Tamil review.
 */
export function EnvironmentBanner() {
  if (deploymentKind() !== "staging") return null;
  return (
    <aside className={styles.banner} lang="en" data-environment="staging" aria-label="Environment">
      <Notice tone="warning" title="STAGING — test site with fictional data" live={false}>
        <p>This is not the church&apos;s live website. Nothing here is real, and no email is delivered.</p>
      </Notice>
    </aside>
  );
}
