"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { Button, TextField } from "@/design-system/components";
import { Cluster, Stack, Text } from "@/design-system/primitives";
import { t, type Locale, type UiStringKey } from "@/content/ui-strings";
import { authClient } from "@/lib/auth-client";
import styles from "../account.module.css";

/** Maps the plugin's error codes to approved strings. Never echoes server messages. */
export function challengeError(status: number | undefined, code: string | undefined): UiStringKey {
  if (code === "ACCOUNT_TEMPORARILY_LOCKED" || status === 429) return "twoFactor.error.locked";
  if (code === "INVALID_TWO_FACTOR_COOKIE" || code === "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE") return "twoFactor.error.expired";
  if (code === "INVALID_CODE" || code === "INVALID_BACKUP_CODE" || status === 401) return "twoFactor.error.code";
  return "auth.error.generic";
}

/**
 * Second step of sign-in for accounts with two-factor on. The password step left a short-lived,
 * signed, HttpOnly challenge cookie (5 minutes, 5 tries); a correct authenticator or recovery
 * code turns it into a normal session. There is no "trust this device" option.
 */
export function TwoFactorChallenge({ locale }: { locale: Locale }) {
  const L = (k: UiStringKey) => t(k, locale);
  const router = useRouter();
  const uid = useId();
  const [mode, setMode] = useState<"totp" | "recovery">("totp");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UiStringKey | null>(null);
  const fieldId = `${uid}-${mode}`;
  const focusField = () => document.getElementById(fieldId)?.focus();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const raw = String(new FormData(e.currentTarget).get("code") ?? "").trim();
    setError(null);
    if (mode === "totp" && !/^\d{6}$/.test(raw.replace(/\s/g, ""))) {
      setError("twoFactor.error.code");
      focusField();
      return;
    }
    setBusy(true);
    try {
      const result =
        mode === "totp"
          ? await authClient.twoFactor.verifyTotp({ code: raw.replace(/\s/g, "") })
          : await authClient.twoFactor.verifyBackupCode({ code: raw.replace(/\s/g, "") });
      if (result.error) {
        setError(challengeError(result.error.status, result.error.code));
        focusField();
        return;
      }
      router.push(`/${locale}/account`);
    } catch {
      setError("auth.error.generic");
    } finally {
      setBusy(false);
    }
  }

  const switchMode = () => {
    setMode((m) => (m === "totp" ? "recovery" : "totp"));
    setError(null);
    requestAnimationFrame(() => document.getElementById(`${uid}-${mode === "totp" ? "recovery" : "totp"}`)?.focus());
  };

  return (
    <Stack gap={5} className={styles.column}>
      <form onSubmit={onSubmit} aria-describedby={error ? `${uid}-error` : undefined}>
        <Stack gap={4}>
          {mode === "totp" ? (
            <TextField
              key="totp"
              id={`${uid}-totp`}
              name="code"
              label={L("twoFactor.field.code")}
              requirementText={L("form.required")}
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9 ]*"
              maxLength={7}
              className={styles.codeField}
              required
              autoFocus
            />
          ) : (
            <TextField
              key="recovery"
              id={`${uid}-recovery`}
              name="code"
              label={L("twoFactor.field.recoveryCode")}
              hint={L("twoFactor.recovery.hint")}
              requirementText={L("form.required")}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={16}
              className={styles.codeField}
              required
            />
          )}
          {error ? (
            <Text id={`${uid}-error`} role="alert" medium className={styles.formError}>
              {L(error)}
              {error === "twoFactor.error.expired" ? (
                <>
                  {" "}
                  <a href={`/${locale}/sign-in`}>{L("auth.signIn.title")}</a>
                </>
              ) : null}
            </Text>
          ) : null}
          <Cluster>
            <Button type="submit" loading={busy} loadingLabel={L("form.loading")}>
              {L("twoFactor.verify")}
            </Button>
            <Button type="button" variant="tertiary" onClick={switchMode}>
              {L(mode === "totp" ? "twoFactor.useRecovery" : "twoFactor.useApp")}
            </Button>
          </Cluster>
        </Stack>
      </form>
    </Stack>
  );
}
