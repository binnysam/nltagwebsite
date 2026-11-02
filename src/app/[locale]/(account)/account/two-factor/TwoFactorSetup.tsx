"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button, CheckboxField, Notice, TextField } from "@/design-system/components";
import { Cluster, Heading, Stack, Text } from "@/design-system/primitives";
import { t, type Locale, type UiStringKey } from "@/content/ui-strings";
import { confirmEnrollment, disableTwoFactor, regenerateRecoveryCodes, startEnrollment, type TwoFactorResult } from "./actions";
import { QrCode } from "./QrCode";
import styles from "../../account.module.css";

interface Props {
  locale: Locale;
  enabled: boolean;
  /** Unused recovery codes left, when two-factor is on. */
  remaining: number | null;
}

type Enrollment = { uri: string; setupKey: string; codes: string[] };

/**
 * Enrollment (password → scan → save codes and confirm a code) and, once on, new recovery codes
 * and turning it off. Built from design-system parts only. The secret and recovery codes live in
 * component state for this screen only; they are never stored in the browser or sent anywhere else.
 */
export function TwoFactorSetup({ locale, enabled, remaining }: Props) {
  const L = (k: UiStringKey) => t(k, locale);
  const router = useRouter();
  const uid = useId();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ where: string; key: UiStringKey } | null>(null);
  const [done, setDone] = useState<UiStringKey | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const focusTarget = useRef<HTMLDivElement | null>(null);
  const [focusKey, setFocusKey] = useState(0);

  useEffect(() => {
    if (focusKey) focusTarget.current?.focus();
  }, [focusKey]);

  async function run(where: string, form: HTMLFormElement, action: (data: FormData) => Promise<TwoFactorResult | null>, onOk: (r: Extract<TwoFactorResult, { ok: true }>) => void) {
    if (busy) return;
    setError(null);
    setDone(null);
    setBusy(where);
    try {
      const r = await action(new FormData(form));
      if (!r) return;
      if (!r.ok) {
        setError({ where, key: r.error });
        return;
      }
      onOk(r);
    } catch {
      setError({ where, key: "auth.error.generic" });
    } finally {
      setBusy(null);
    }
  }

  const errorFor = (where: string) =>
    error?.where === where ? (
      <Text id={`${uid}-${where}-error`} role="alert" medium className={styles.formError}>
        {L(error.key)}
      </Text>
    ) : null;

  const download = (codes: string[]) => {
    const text = [L("twoFactor.recovery.listLabel") + " — NLTAG", L("twoFactor.recovery.hint"), "", ...codes, ""].join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "nltag-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const codeList = (codes: string[]) => (
    <Stack gap={3}>
      <ul className={styles.codeList} aria-label={L("twoFactor.recovery.listLabel")} lang="en" translate="no">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <Cluster>
        <Button type="button" variant="secondary" onClick={() => download(codes)}>
          {L("twoFactor.recovery.download")}
        </Button>
      </Cluster>
    </Stack>
  );

  const passwordField = (where: string, autoFocus = false) => (
    <TextField
      id={`${uid}-${where}-password`}
      name="password"
      type="password"
      label={L("auth.field.password")}
      requirementText={L("form.required")}
      autoComplete="current-password"
      maxLength={128}
      required
      autoFocus={autoFocus}
    />
  );

  const currentCodeField = (where: string) => (
    <TextField
      id={`${uid}-${where}-code`}
      name="code"
      label={L("twoFactor.field.currentCode")}
      requirementText={L("form.required")}
      autoComplete="one-time-code"
      autoCapitalize="none"
      spellCheck={false}
      maxLength={16}
      className={styles.codeField}
      required
    />
  );

  // ---- Two-factor is on: status, new recovery codes, turn off ----
  if (enabled) {
    return (
      <Stack gap={6} className={styles.column}>
        {done ? (
          <div ref={focusTarget as React.RefObject<HTMLDivElement>} tabIndex={-1}>
            <Notice tone="success" title={L(done)} />
          </div>
        ) : (
          <Notice tone="success" title={L("twoFactor.status.on")}>
            {remaining !== null ? <Text>{L("twoFactor.recovery.remaining").replace("{n}", String(remaining))}</Text> : null}
          </Notice>
        )}

        <section aria-labelledby={`${uid}-codes-h`} className={styles.panel}>
          <Stack gap={4}>
            <Heading level={2} styleAs="h3" id={`${uid}-codes-h`}>{L("twoFactor.recovery.title")}</Heading>
            {newCodes ? (
              <Stack gap={4}>
                <Text>{L("twoFactor.recovery.help")}</Text>
                {codeList(newCodes)}
              </Stack>
            ) : (
              <form
                aria-describedby={error?.where === "regen" ? `${uid}-regen-error` : undefined}
                onSubmit={(e: FormEvent<HTMLFormElement>) => {
                  e.preventDefault();
                  void run("regen", e.currentTarget, (d) => regenerateRecoveryCodes(String(d.get("password") ?? ""), String(d.get("code") ?? "")), (r) => {
                    setNewCodes(r.codes ?? []);
                    setDone("twoFactor.regenerate.done");
                    setFocusKey((k) => k + 1);
                  });
                }}
              >
                <Stack gap={4}>
                  <Text tone="secondary">{L("twoFactor.regenerate.help")}</Text>
                  {passwordField("regen")}
                  {currentCodeField("regen")}
                  {errorFor("regen")}
                  <Cluster>
                    <Button type="submit" variant="secondary" loading={busy === "regen"} loadingLabel={L("form.loading")}>
                      {L("twoFactor.regenerate.submit")}
                    </Button>
                  </Cluster>
                </Stack>
              </form>
            )}
          </Stack>
        </section>

        <section aria-labelledby={`${uid}-off-h`} className={styles.panel}>
          <form
            aria-describedby={error?.where === "off" ? `${uid}-off-error` : undefined}
            onSubmit={(e: FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              void run("off", e.currentTarget, (d) => disableTwoFactor(String(d.get("password") ?? ""), String(d.get("code") ?? "")), () => {
                setDone("twoFactor.disable.done");
                router.refresh();
              });
            }}
          >
            <Stack gap={4}>
              <Heading level={2} styleAs="h3" id={`${uid}-off-h`}>{L("twoFactor.disable.title")}</Heading>
              <Text tone="secondary">{L("twoFactor.disable.help")}</Text>
              {passwordField("off")}
              {currentCodeField("off")}
              {errorFor("off")}
              <Cluster>
                <Button type="submit" variant="tertiary" loading={busy === "off"} loadingLabel={L("form.loading")}>
                  {L("twoFactor.disable.submit")}
                </Button>
              </Cluster>
            </Stack>
          </form>
        </section>
      </Stack>
    );
  }

  // ---- Enrollment ----
  return (
    <Stack gap={6} className={styles.column}>
      {done ? (
        <div ref={focusTarget as React.RefObject<HTMLDivElement>} tabIndex={-1}>
          <Notice tone="success" title={L(done)} />
        </div>
      ) : (
        <Notice tone="info" title={L("twoFactor.status.off")} />
      )}

      {!enrollment ? (
        <form
          aria-describedby={error?.where === "start" ? `${uid}-start-error` : undefined}
          onSubmit={(e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            void run("start", e.currentTarget, (d) => startEnrollment(String(d.get("password") ?? "")), (r) => {
              setEnrollment({ uri: r.uri!, setupKey: r.setupKey!, codes: r.codes! });
              setFocusKey((k) => k + 1);
            });
          }}
        >
          <Stack gap={4}>
            <Heading level={2} styleAs="h3">{L("twoFactor.step1")}</Heading>
            {passwordField("start")}
            {errorFor("start")}
            <Cluster>
              <Button type="submit" loading={busy === "start"} loadingLabel={L("form.loading")}>
                {L("twoFactor.continue")}
              </Button>
            </Cluster>
          </Stack>
        </form>
      ) : (
        <>
          <section aria-labelledby={`${uid}-scan-h`}>
            <Stack gap={4}>
              <div tabIndex={-1} ref={focusTarget as React.RefObject<HTMLDivElement>} className={styles.focusAnchor}>
                <Heading level={2} styleAs="h3" id={`${uid}-scan-h`}>
                  {L("twoFactor.step2")}
                </Heading>
              </div>
              <Text>{L("twoFactor.step2.help")}</Text>
              <QrCode value={enrollment.uri} label={L("twoFactor.qr.label")} />
              <Stack gap={1}>
                <Text variant="small" tone="secondary">{L("twoFactor.setupKey")}</Text>
                <Text medium className={styles.setupKey} lang="en" translate="no" data-testid="setup-key">
                  {enrollment.setupKey}
                </Text>
              </Stack>
            </Stack>
          </section>

          <section aria-labelledby={`${uid}-save-h`} className={styles.panel}>
            <form
              aria-describedby={error?.where === "confirm" ? `${uid}-confirm-error` : undefined}
              onSubmit={(e: FormEvent<HTMLFormElement>) => {
                e.preventDefault();
                const form = e.currentTarget;
                if (!new FormData(form).get("saved")) {
                  setError({ where: "confirm", key: "twoFactor.recovery.savedRequired" });
                  return;
                }
                void run("confirm", form, (d) => confirmEnrollment(String(d.get("code") ?? "")), () => {
                  setEnrollment(null);
                  setDone("twoFactor.enabled.done");
                  setFocusKey((k) => k + 1);
                  router.refresh();
                });
              }}
            >
              <Stack gap={4}>
                <Heading level={2} styleAs="h3" id={`${uid}-save-h`}>{L("twoFactor.step3")}</Heading>
                <Text>{L("twoFactor.recovery.help")}</Text>
                {codeList(enrollment.codes)}
                <CheckboxField id={`${uid}-saved`} name="saved" label={L("twoFactor.recovery.saved")} />
                <TextField
                  id={`${uid}-confirm-code`}
                  name="code"
                  label={L("twoFactor.field.code")}
                  requirementText={L("form.required")}
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  pattern="[0-9 ]*"
                  maxLength={7}
                  className={styles.codeField}
                  required
                />
                {errorFor("confirm")}
                <Cluster>
                  <Button type="submit" loading={busy === "confirm"} loadingLabel={L("form.loading")}>
                    {L("twoFactor.confirm.submit")}
                  </Button>
                </Cluster>
              </Stack>
            </form>
          </section>
        </>
      )}
    </Stack>
  );
}
