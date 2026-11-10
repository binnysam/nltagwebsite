import { deploymentKind } from "../deployment/environment";
import { can, type Principal } from "../policy/permissions";

/**
 * Feature switch for the public forms and the gallery (website completion, Nov 2026), and who they
 * are open to. Pure: no I/O, so it is unit-tested directly and shared by pages, server actions,
 * services, the configuration guard and the build.
 *
 *   NLTAG_PUBLIC_FORMS unset / anything else  → "off"     forms, gallery and inboxes 404
 *   NLTAG_PUBLIC_FORMS=1                      → "public"  open to everyone (needs migration 0004)
 *   NLTAG_PUBLIC_FORMS=staff                  → "staff"   staging test mode (owner approval
 *       10 Nov 2026): the inboxes and the Prayer Team role work as with "1", but the public pages,
 *       every form submission and the gallery are open only to a signed-in account with a staff
 *       role (the `staff.portal` permission: verified email, a staff role, and two-factor where
 *       the role requires it). Visitors and accounts without a staff role get the same 404 /
 *       "not available" as when the forms are off.
 *
 * "staff" is never honoured by a production deployment: there it resolves to "off" (fail closed),
 * the configuration guard refuses to run the server (deploymentConfigProblems) and the Hostinger
 * build refuses to build (scripts/hostinger-build.mjs). Local development and tests may use it.
 */
export type FormsMode = "off" | "public" | "staff";

type Env = Record<string, string | undefined>;

export const STAFF_FORMS_VALUE = "staff";

/** True when this environment is, or says it is, production. */
export function isProductionDeployment(env: Env = process.env): boolean {
  return deploymentKind(env) === "production" || (env.NLTAG_DEPLOYMENT ?? "").trim() === "production";
}

export function formsMode(env: Env = process.env): FormsMode {
  const v = (env.NLTAG_PUBLIC_FORMS ?? "").trim();
  if (v === "1") return "public";
  if (v === STAFF_FORMS_VALUE) return isProductionDeployment(env) ? "off" : "staff";
  return "off";
}

/** The database tables (migration 0004) are in use: the staff inboxes and the Prayer Team role. */
export const formsConfigured = (env: Env = process.env) => formsMode(env) !== "off";

/** Open to everyone, so pages may advertise the forms (footer links, "share" buttons). */
export const formsOpenToEveryone = (env: Env = process.env) => formsMode(env) === "public";

/** May this viewer see the form pages, submit a form or see the gallery? */
export function formsOpenTo(viewer: Principal, env: Env = process.env): boolean {
  const mode = formsMode(env);
  if (mode === "public") return true;
  if (mode === "staff") return viewer.kind === "user" && can(viewer, "staff.portal");
  return false;
}

/** Configuration problem for the guard, or null. Names and rules only, never values. */
export function formsConfigProblem(env: Env = process.env): string | null {
  if ((env.NLTAG_PUBLIC_FORMS ?? "").trim() === STAFF_FORMS_VALUE && isProductionDeployment(env)) {
    return "NLTAG_PUBLIC_FORMS: 'staff' is a staging-only test mode and is not allowed in production";
  }
  return null;
}
