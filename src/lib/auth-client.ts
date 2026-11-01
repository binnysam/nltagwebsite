"use client";
import { createAuthClient } from "better-auth/react";

/** Browser client for the account pages. Same origin; talks to /api/auth only. */
export const authClient = createAuthClient({ basePath: "/api/auth" });
