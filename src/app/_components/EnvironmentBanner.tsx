import { deploymentKind } from "@/server/deployment/environment";
import styles from "./environment-banner.module.css";
export { titlePrefix } from "@/server/deployment/environment";

/**
 * Visible environment indicator (staging safety rule 12). Rendered at the top of every public and
 * admin page on the staging deployment only; production renders nothing. Styled like the
 * design-system Notice in its warning tone (same status tokens) with a small module of its own:
 * importing a component here would put that component's stylesheet into the root layout of every
 * deployment and shift the approved visual baselines. English only on purpose: it is an operator
 * label never shown on the live site, so it is not a public interface string for Tamil review.
 * A labelled landmark, not a live region (it is not a message).
 */
export function EnvironmentBanner() {
  if (deploymentKind() !== "staging") return null;
  return (
    <aside className={styles.banner} lang="en" data-environment="staging" aria-label="Environment">
      <div className={styles.box}>
        <p className={styles.title}>STAGING — test site with fictional data</p>
        <p className={styles.body}>This is not the church&apos;s live website. Nothing here is real, and no email is delivered.</p>
      </div>
    </aside>
  );
}
