"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, TextInput } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { apiSend } from "@/lib/api/browser";

const CROSS = "✕";

type Result = { password: string | null; generated: boolean };
type Props = { userId: string; name: string; onClose: () => void };

/**
 * The owner resets someone else's password: a generated temporary one (shown once, to hand
 * over) or one typed here. The user's other sessions end and a locked account is unlocked.
 */
export function ResetPasswordDialog({ userId, name, onClose }: Props) {
  const t = useTranslations("users");
  const toast = useToast();
  const [typed, setTyped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const own = typed ? String(new FormData(e.currentTarget).get("password") ?? "") : null;
    setBusy(true);
    setError(null);
    const res = await apiSend<Result>(
      "POST",
      `/users/${userId}/reset-password/`,
      own ? { password: own } : {},
    );
    setBusy(false);
    if (!res.ok) {
      setError(res.error && "password" in res.error ? t("weakPassword") : t("resetFailed"));
      return;
    }
    if (res.data.password) {
      setShown(res.data.password);
      return;
    }
    toast.push("success", t("resetDone"));
    onClose();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(shown ?? "");
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Dialog
      open
      onClose={busy || shown ? undefined : onClose}
      labelledBy="reset-title"
      className="w-[480px]"
    >
      {shown ? (
        <div className="grid gap-[12px]">
          <div id="reset-title" className="text-lead font-medium">
            {t("tempTitle")}
          </div>
          <p className="m-0 text-body text-text-secondary">{t("tempBody", { name })}</p>
          <div
            data-testid="temp-password"
            className="num rounded-control bg-surface-subtle p-[12px] text-center text-section font-semibold select-all"
          >
            {shown}
          </div>
          <div className="flex justify-end gap-[8px]">
            <Button variant="outline" size="lg" onClick={() => void copy()}>
              {copied ? t("copied") : t("copy")}
            </Button>
            <Button size="lg" onClick={onClose}>
              {t("done")}
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="grid gap-[12px]">
          <div id="reset-title" className="text-lead font-medium">
            {t("resetTitle", { name })}
          </div>
          <p className="m-0 text-body text-text-secondary">{t("resetHelp")}</p>
          <label className="flex min-h-[44px] cursor-pointer items-center gap-[10px]">
            <input
              type="checkbox"
              checked={typed}
              onChange={(e) => setTyped(e.target.checked)}
              className="m-0 size-[20px] accent-brand"
            />
            {t("resetTypeOwn")}
          </label>
          {typed && (
            <Field label={t("password")} help={t("passwordHelp")}>
              {({ id, describedBy }) => (
                <TextInput
                  className="num"
                  id={id}
                  name="password"
                  type="password"
                  dir="ltr"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  aria-describedby={describedBy}
                />
              )}
            </Field>
          )}
          {error && (
            <div role="alert" className="text-label font-medium text-danger-text">
              {CROSS} {error}
            </div>
          )}
          <div className="flex justify-end gap-[8px]">
            <Button variant="outline" size="lg" disabled={busy} onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" size="lg" disabled={busy}>
              {busy ? t("resetting") : t("resetConfirm")}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
