// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { uiStrings } from "@/content/ui-strings";
import { renderAlertEmail } from "@/server/email/templates";
import { CLIENT_IP_HEADER } from "@/server/security/client-ip";

describe("sign-in throttle alert email", () => {
  it("is English only while its Tamil wording awaits owner approval, and has no link", () => {
    expect(uiStrings["email.signInThrottled.body"].taStatus).toBe("draft-review");
    const m = renderAlertEmail("signin-throttled");
    expect(m.subject).toBe(uiStrings["email.signInThrottled.subject"].en);
    expect(m.text).not.toContain(uiStrings["email.signInThrottled.body"].ta);
    expect(m.html).not.toContain('lang="ta"');
    expect(m.text).not.toMatch(/https?:\/\//);
    expect(m.html).not.toMatch(/<a\s/i);
  });
});

describe("requests through src/proxy.ts itself", () => {
  afterEach(() => vi.unstubAllEnvs());

  const forwardedTo = async (headers: Record<string, string>) => {
    const { proxy } = await import("@/proxy");
    const res = proxy(new NextRequest("http://localhost:3000/api/auth/sign-in/email", { method: "POST", headers }));
    // NextResponse.next({ request: { headers } }) announces the rewritten request headers this way.
    const overridden = (res.headers.get("x-middleware-override-headers") ?? "").split(",");
    return { overridden, value: res.headers.get(`x-middleware-request-${CLIENT_IP_HEADER}`) };
  };

  it("replaces a forged internal client-IP header with the resolved address", async () => {
    vi.stubEnv("CLIENT_IP_SOURCE", "forwarded-chain");
    vi.stubEnv("CLIENT_IP_SHAPE_LOG", "off");
    const r = await forwardedTo({ [CLIENT_IP_HEADER]: "192.0.2.1", "x-forwarded-for": "192.0.2.9, 203.0.113.9", "x-real-ip": "203.0.113.9" });
    expect(r.value).toBe("203.0.113.9");
  });

  it("removes a forged internal client-IP header when the address cannot be trusted", async () => {
    vi.stubEnv("CLIENT_IP_SOURCE", "forwarded-chain");
    vi.stubEnv("CLIENT_IP_SHAPE_LOG", "off");
    const r = await forwardedTo({ [CLIENT_IP_HEADER]: "192.0.2.1", "x-forwarded-for": "192.0.2.1" });
    expect(r.value).toBeNull();
    // The header is not in the rewritten request at all (deleted, not merely unset).
    expect(r.overridden).not.toContain(CLIENT_IP_HEADER);
  });

  it("removes it with resolution off (the production default)", async () => {
    vi.stubEnv("CLIENT_IP_SOURCE", "");
    vi.stubEnv("CLIENT_IP_SHAPE_LOG", "off");
    const r = await forwardedTo({ [CLIENT_IP_HEADER]: "192.0.2.1", "x-forwarded-for": "203.0.113.9", "x-real-ip": "203.0.113.9" });
    expect(r.value).toBeNull();
    expect(r.overridden).not.toContain(CLIENT_IP_HEADER);
  });
});
