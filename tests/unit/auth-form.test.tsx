import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { t, type Locale } from "@/content/ui-strings";

/**
 * Forgot-password form (PR #24, owner decision 5 Nov 2026): every answer that means a request was
 * accepted shows the same neutral message, whatever the address; the two answers that mean nothing
 * was queued — 429 (the address's window is used up) and 503 (the server is shutting down or its
 * reset queue is full; the same for every address) — ask the person to try again instead of
 * claiming that a link was sent. Other forms' messages are pinned unchanged.
 */

const requestPasswordReset = vi.fn();
const signInEmail = vi.fn();
const push = vi.fn();
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    requestPasswordReset: (...a: unknown[]) => requestPasswordReset(...a),
    signIn: { email: (...a: unknown[]) => signInEmail(...a), social: vi.fn() },
    resetPassword: vi.fn(),
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

// Imported after the mocks.
const { AuthForm } = await import("@/app/[locale]/(account)/AuthForm");

const fail = (status: number, code?: string) => ({ data: null, error: { status, code, message: "server text that must never be shown" } });

async function submit(mode: "forgot" | "signIn", locale: Locale) {
  render(<AuthForm mode={mode} locale={locale} />);
  fireEvent.change(screen.getByLabelText(t("auth.field.email", locale), { exact: false }), { target: { value: "someone@nltag.test" } });
  if (mode === "signIn") fireEvent.change(screen.getByLabelText(t("auth.field.password", locale), { exact: false }), { target: { value: "wrong-password-1" } });
  fireEvent.submit(screen.getByRole("button", { name: t(mode === "forgot" ? "auth.forgot.submit" : "auth.submit.signIn", locale) }).closest("form")!);
}

beforeEach(() => {
  requestPasswordReset.mockReset();
  signInEmail.mockReset();
  push.mockReset();
});

describe.each(["en", "ta"] as const)("forgot-password form (%s)", (locale) => {
  const sent = t("auth.forgot.sent", locale);

  it("200: the neutral 'if an account exists' message", async () => {
    requestPasswordReset.mockResolvedValue({ data: { status: true }, error: null });
    await submit("forgot", locale);
    expect(await screen.findByRole("status")).toHaveTextContent(sent);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("503 (shutting down or queue full): a try-again message, never 'link sent'", async () => {
    requestPasswordReset.mockResolvedValue(fail(503, "TRY_AGAIN"));
    await submit("forgot", locale);
    expect(await screen.findByRole("alert")).toHaveTextContent(t("auth.error.generic", locale));
    expect(screen.queryByText(sent)).toBeNull();
    expect(screen.queryByText(/server text/)).toBeNull();
    // The form stays usable so the person can try again.
    expect(screen.getByRole("button", { name: t("auth.forgot.submit", locale) })).toBeEnabled();
  });

  it("429 (window used up): the rate-limited message, never 'link sent'", async () => {
    requestPasswordReset.mockResolvedValue(fail(429, "TOO_MANY_ATTEMPTS"));
    await submit("forgot", locale);
    expect(await screen.findByRole("alert")).toHaveTextContent(t("auth.error.rateLimited", locale));
    expect(screen.queryByText(sent)).toBeNull();
  });

  it.each([400, 403, 500])("%i: unchanged, the neutral message (no account discovery)", async (status) => {
    requestPasswordReset.mockResolvedValue(fail(status));
    await submit("forgot", locale);
    expect(await screen.findByRole("status")).toHaveTextContent(sent);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("network failure: unchanged, the generic error", async () => {
    requestPasswordReset.mockRejectedValue(new Error("offline"));
    await submit("forgot", locale);
    expect(await screen.findByRole("alert")).toHaveTextContent(t("auth.error.generic", locale));
  });

  it("sends only the address and the local reset page", async () => {
    requestPasswordReset.mockResolvedValue({ data: { status: true }, error: null });
    await submit("forgot", locale);
    await waitFor(() => expect(requestPasswordReset).toHaveBeenCalledTimes(1));
    expect(requestPasswordReset).toHaveBeenCalledWith({ email: "someone@nltag.test", redirectTo: `/${locale}/reset-password` });
  });
});

describe("sign-in form messages are unchanged", () => {
  it.each([
    [429, "TOO_MANY_ATTEMPTS", "auth.error.rateLimited"],
    [401, "INVALID_EMAIL_OR_PASSWORD", "auth.error.invalid"],
    [503, "TRY_AGAIN", "auth.error.generic"],
  ] as const)("%i → %s", async (status, code, key) => {
    signInEmail.mockResolvedValue(fail(status, code));
    await submit("signIn", "en");
    expect(await screen.findByRole("alert")).toHaveTextContent(t(key, "en"));
    expect(push).not.toHaveBeenCalled();
  });
});
