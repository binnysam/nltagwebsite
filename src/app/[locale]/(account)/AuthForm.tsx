"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button, TextField } from "@/design-system/components";
import { Cluster, Stack, Text } from "@/design-system/primitives";
import { t, type Locale, type UiStringKey } from "@/content/ui-strings";
import { authClient } from "@/lib/auth-client";
import styles from "./account.module.css";

export type AuthMode = "signIn" | "signUp" | "forgot" | "reset";

interface Props {
  mode: AuthMode;
  locale: Locale;
  /** Reset token from the emailed link (reset mode only). */
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
 * Sign-in, sign-up, forgot-password and reset-password forms. Built only from design-system
 * components. Success and error messages are the same whether or not an account exists.
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
      setDone("auth.signUp.sent");
      return;
    }
    if ((mode === "signUp" || mode === "reset") && password.length < MIN_PASSWORD) {
      setFieldError(L("auth.error.passwordShort"));
      return;
    }

    setBusy(true);
    try {
      const callbackURL = `/${locale}/verify-email`;
      const result =
        mode === "signIn"
          ? await authClient.signIn.email({ email, password, callbackURL })
          : mode === "signUp"
            ? await authClient.signUp.email({ email, password, name: String(data.get("name") ?? "").trim(), callbackURL })
            : mode === "forgot"
              ? await authClient.requestPasswordReset({ email, redirectTo: `/${locale}/reset-password` })
              : await authClient.resetPassword({ newPassword: password, token: token ?? "" });

      if (result.error) {
        // Sign-up and forgot-password always show the neutral message (no account discovery).
        if (mode === "signUp" && result.error.status !== 429) setDone("auth.signUp.sent");
        else if (mode === "forgot" && result.error.status !== 429) setDone("auth.forgot.sent");
        else setError(errorKey(result.error.status, result.error.code));
        return;
      }
      // Password correct, account has two-factor on: no session yet, the code page finishes sign-in.
      if (mode === "signIn" && (result.data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) router.push(`/${locale}/two-factor`);
      else if (mode === "signIn") router.push(`/${locale}/account`);
      else if (mode === "signUp") setDone("auth.signUp.sent");
      else if (mode === "forgot") setDone("auth.forgot.sent");
      else setDone("auth.reset.done");
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
        {done === "auth.reset.done" ? (
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
  };
  const required = L("form.required");

  return (
    <Stack gap={5} className={styles.column}>
      <form onSubmit={onSubmit} noValidate={false} aria-describedby={error ? `${uid}-error` : undefined}>
        <Stack gap={4}>
          {mode === "signUp" ? (
            <TextField id={`${uid}-name`} name="name" label={L("auth.field.name")} requirementText={required} autoComplete="name" required maxLength={200} />
          ) : null}
          {mode !== "reset" ? (
            <TextField id={`${uid}-email`} name="email" type="email" label={L("auth.field.email")} requirementText={required} autoComplete="email" inputMode="email" required maxLength={254} />
          ) : null}
          {mode !== "forgot" ? (
            <TextField
              id={`${uid}-password`}
              name="password"
              type="password"
              label={L(mode === "reset" ? "auth.field.newPassword" : "auth.field.password")}
              hint={mode === "signUp" || mode === "reset" ? L("auth.passwordHint") : undefined}
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
