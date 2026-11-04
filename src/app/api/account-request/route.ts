import { accountsEnabled } from "@/server/accounts-gate";
import { handleAccountRequest } from "@/server/auth/request-account";

export const dynamic = "force-dynamic";

const notFound = () => new Response("Not Found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export async function POST(req: Request) {
  return accountsEnabled() ? handleAccountRequest(req) : notFound();
}
