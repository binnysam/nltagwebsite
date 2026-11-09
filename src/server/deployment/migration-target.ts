// Which database a migration run may target. Pure, unit-tested (tests/unit/staging-safety.test.ts).
//
//   staging run (`npm run staging:migrate`, flag --staging): only with NLTAG_DEPLOYMENT=staging and
//     never with the production approval flag. The live check (verify.ts) then confirms the
//     database itself before any DDL.
//   any other run: never against a staging deployment, and with NODE_ENV=production only with the
//     owner's NLTAG_APPROVED_PRODUCTION_MIGRATION=1 (unchanged rule).
import { databaseNameOf, isStaging } from "./environment";

export function migrationTargetProblems(env: Record<string, string | undefined>, stagingRun: boolean): string[] {
  const staging = isStaging(env);
  const prodFlag = (env.NLTAG_APPROVED_PRODUCTION_MIGRATION ?? "").trim() === "1";
  if (stagingRun) {
    const p: string[] = [];
    if (!staging) p.push("staging:migrate needs NLTAG_DEPLOYMENT=staging");
    if (prodFlag) p.push("the production approval flag is not allowed in a staging migration");
    if (!/staging/i.test(databaseNameOf(env.DATABASE_URL) ?? "")) p.push("the target database name does not contain 'staging'");
    return p;
  }
  if (staging) return ["staging migrations run only through `npm run staging:migrate`"];
  if (env.NODE_ENV === "production" && !prodFlag) {
    return ["a production database needs NLTAG_APPROVED_PRODUCTION_MIGRATION=1 (owner approval required)"];
  }
  if (env.NODE_ENV === "production" && /staging/i.test(databaseNameOf(env.DATABASE_URL) ?? "")) {
    return ["the production migration path must not target a staging database"];
  }
  return [];
}
