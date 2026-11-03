"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button, TextField } from "@/design-system/components";
import { Cluster, Stack, Text } from "@/design-system/primitives";
import { t, type Locale, type UiStringKey } from "@/content/ui-strings";
import { authClient } from "@/lib/auth-client";
import styles from "./account.module.css";

export type AuthMode = "signIn" | "signUp" | "forgot" | "reset" | "setPassword";

interface Props {
  mode: AuthMode;
  locale: Locale;
  /** Token from the emailed link (reset and setPassword modes only). */
  token?: string;
  googleEnabled?: boolean;
}

const MIN_PASSWORD = 10;

/** Maps Better Auth errors to approved interface strings. Never echoes server messages. */
function errorKey(status: number | undefined, code: string | undefined): UiStringKey {
  if (status === 429) return "auth.error.rateLimited";
  if (code === "EMAIL_NOT_VERIFIED" || status === 403) return "auth.verify.pending";
  if (status === 401 || code === "INVALID_EMAIL_OR_PASSWORD") return "auth.error.invalid";
  if (code === "INVALID_TOKEN") return "auth.reset.invalid";
  if (code === "PASSWORD_TOO_SHORT") return "auth.error.passwordShort";
  return "auth.error.generic";
}

/**
 * R4 mailbox-first account request (D1): only an address goes to /api/account-request. The answer
 * is the same for every address; the person chooses a password from the emailed link.
 */
async function requestAccount(email: string, locale: Locale): Promise<{ status: number }> {
  const res = await fetch("/api/account-request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, locale }),
    credentials: "same-origin",
  });
  return { status: res.status };
}

/**
 * Sign-in, account-request, forgot-password, reset-password and set-password forms. Built only from
 * design-system components. Success and error messages are the same whether or not an account exists.
 */
export function AuthForm({ mode, locale, token, googleEnabled }: Props) {
  const L = (k: UiStringKey) => t(k, locale);
  const router = useRouter();
  const uid = useId();
  const startedAt = useRef(0);
  useEffect(() => {
    startedAt.current = Date.now();
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UiStringKey | null>(null);
  const [done, setDone] = useState<UiStringKey | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const data = new FormData(e.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    setError(null);
    setFieldError(undefined);

    // Spam trap and a minimum fill time: bots get the normal success message and nothing happens.
    if (mode === "signUp" && (data.get("website") || Date.now() - startedAt.current < 1500)) {
      setDone("auth.accountRequest.sent");
      return;
    }
    if ((mode === "reset" || mode === "setPassword") && password.length < MIN_PASSWORD) {
      setFieldError(L("auth.error.passwordShort"));
      return;
    }

    setBusy(true);
    try {
      if (mode === "signUp") {
        // Every answer but "too many requests" shows the neutral message (no account discovery).
        const { status } = await requestAccount(email, locale);
        if (status === 429) setError("auth.error.rateLimited");
        else setDone("auth.accountRequest.sent");
        return;
      }
      const result =
        mode === "signIn"
          ? await authClient.signIn.email({ email, password, callbackURL: `/${locale}/verify-email` })
          : mode === "forgot"
            ? await authClient.requestPasswordReset({ email, redirectTo: `/${locale}/reset-password` })
            : await authClient.resetPassword({ newPassword: password, token: token ?? "" });

      if (result.error) {
        // Forgot-password always shows the neutral message (no account discovery).
        if (mode === "forgot" && result.error.status !== 429) setDone("auth.forgot.sent");
        else setError(errorKey(result.error.status, result.error.code));
        return;
      }
      // Password correct, account has two-factor on: no session yet, the code page finishes sign-in.
      if (mode === "signIn" && (result.data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) router.push(`/${locale}/two-factor`);
      else if (mode === "signIn") router.push(`/${locale}/account`);
      else if (mode === "forgot") setDone("auth.forgot.sent");
      else setDone(mode === "setPassword" ? "auth.setPassword.done" : "auth.reset.done");
    } catch {
      setError("auth.error.generic");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Stack gap={4}>
        <Text role="status">{L(done)}</Text>
        {done === "auth.accountRequest.sent" ? <Text tone="secondary">{L("auth.accountRequest.retry")}</Text> : null}
        {done === "auth.reset.done" || done === "auth.setPassword.done" ? (
          <Text>
            <a href={`/${locale}/sign-in`}>{L("auth.signIn.title")}</a>
          </Text>
        ) : null}
      </Stack>
    );
  }

  const submitLabel: Record<AuthMode, UiStringKey> = {
    signIn: "auth.submit.signIn",
    signUp: "auth.submit.signUp",
    forgot: "auth.forgot.submit",
    reset: "auth.reset.submit",
    setPassword: "auth.setPassword.submit",
  };
  const needsPassword = mode === "signIn" || mode === "reset" || mode === "setPassword";
  const required = L("form.required");

  return (
    <Stack gap={5} className={styles.column}>
      <form onSubmit={onSubmit} noValidate={false} aria-describedby={error ? `${uid}-error` : undefined}>
        <Stack gap={4}>
          {mode === "signIn" || mode === "signUp" || mode === "forgot" ? (
            <TextField
              id={`${uid}-email`}
              name="email"
              type="email"
              label={L("auth.field.email")}
              hint={mode === "signUp" ? L("auth.accountRequest.hint") : undefined}
              requirementText={required}
              autoComplete="email"
              inputMode="email"
              required
              maxLength={254}
            />
          ) : null}
          {needsPassword ? (
            <TextField
              id={`${uid}-password`}
              name="password"
              type="password"
              label={L(mode === "signIn" ? "auth.field.password" : "auth.field.newPassword")}
              hint={mode === "signIn" ? undefined : L("auth.passwordHint")}
              error={fieldError}
              requirementText={required}
              autoComplete={mode === "signIn" ? "current-password" : "new-password"}
              minLength={mode === "signIn" ? undefined : MIN_PASSWORD}
              maxLength={128}
              required
            />
          ) : null}
          {mode === "signUp" ? (
            // Spam trap: hidden from people and assistive tech, filled in by naive bots.
            <div className="ds-visually-hidden" aria-hidden="true">
              <label htmlFor={`${uid}-website`}>Website</label>
              <input id={`${uid}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" />
            </div>
          ) : null}
          {error ? (
            <Text id={`${uid}-error`} role="alert" medium className={styles.formError}>
              {L(error)}
            </Text>
          ) : null}
          <Cluster>
            <Button type="submit" loading={busy} loadingLabel={L("form.loading")}>
              {L(submitLabel[mode])}
            </Button>
          </Cluster>
        </Stack>
      </form>

      {googleEnabled && (mode === "signIn" || mode === "signUp") ? (
        <Stack gap={3}>
          <Text tone="secondary">{L("auth.or")}</Text>
          <Cluster>
            <Button
              variant="secondary"
              onClick={() => authClient.signIn.social({ provider: "google", callbackURL: `/${locale}/account` })}
            >
              {L("auth.google")}
            </Button>
          </Cluster>
        </Stack>
      ) : null}
    </Stack>
  );
}
