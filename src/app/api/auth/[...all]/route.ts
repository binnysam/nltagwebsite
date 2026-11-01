import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/server/auth/auth";

// Auth responses are per-user and must never be cached or indexed.
export const dynamic = "force-dynamic";

const handler = (req: Request) => getAuth().handler(req);

export const { GET, POST } = toNextJsHandler(handler);
