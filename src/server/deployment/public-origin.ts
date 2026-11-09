import { deploymentKind } from "./environment";

/**
 * Origin used for canonical, hreflang and Open Graph URLs. Production keeps the approved
 * `siteOrigin` (unchanged). Staging uses its own BETTER_AUTH_URL origin, so staging pages never
 * declare the live site as their canonical address and live pages never point at staging.
 */
export function publicOrigin(productionOrigin: string, env: Record<string, string | undefined> = process.env): string {
  if (deploymentKind(env) !== "staging") return productionOrigin;
  try {
    return new URL(env.BETTER_AUTH_URL ?? "").origin;
  } catch {
    return productionOrigin;
  }
}
