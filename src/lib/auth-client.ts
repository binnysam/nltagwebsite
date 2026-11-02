"use client";
import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";

/**
 * Browser client for the account pages. Same origin; talks to /api/auth only.
 * The two-factor plugin adds the sign-in challenge calls (verifyTotp, verifyBackupCode). The
 * sign-in form sends people to /[locale]/two-factor itself, so no automatic redirect is set here.
 * Enrollment, new recovery codes and turning two-factor off run as server actions
 * (src/app/[locale]/(account)/account/two-factor/actions.ts).
 */
export const authClient = createAuthClient({ basePath: "/api/auth", plugins: [twoFactorClient()] });
