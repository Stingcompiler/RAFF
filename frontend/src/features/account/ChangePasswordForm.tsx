"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";
import { useToast } from "@/components/ui/Toast";
import { apiSend } from "@/lib/api/browser";

const CROSS = "✕";

const ERRORS = {
  wrong_current_password: "wrongCurrent",
  same_password: "samePassword",
} as const;

type Problem = { field: "current" | "next" | "confirm" | null; text: string };

/** Your own password: the current one is required, this session stays, other devices sign out. */
export function ChangePasswordForm() {
  const t = useTranslations("account");
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [formKey, setFormKey] = useState(0);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const current = String(form.get("current") ?? "");
    const next = String(form.get("next") ?? "");
    if (next !== String(form.get("confirm") ?? "")) {
      setProblem({ field: "confirm", text: t("mismatch") });
      return;
    }
    setBusy(true);
    setProblem(null);
    const res = await apiSend("POST", "/auth/password/change/", {
      current_password: current,
      new_password: next,
    });
    setBusy(false);
    if (res.ok) {
      setFormKey((k) => k + 1); // empties the three fields
      toast.push("success", t("done"));
      return;
    }
    const code = typeof res.error?.detail === "string" ? res.error.detail : null;
    if (code === "wrong_current_password") {
      setProblem({ field: "current", text: t(ERRORS.wrong_current_password) });
    } else if (code === "same_password") {
      setProblem({ field: "next", text: t(ERRORS.same_password) });
    } else if (res.error && "password" in res.error) {
      setProblem({ field: "next", text: t("weak") });
    } else {
      setProblem({ field: null, text: t("failed") });
    }
  }

  const err = (field: Problem["field"]) => (problem?.field === field ? problem.text : undefined);

  return (
    <div className="max-w-[480px]">
      <Panel title={t("title")}>
        <form
          key={formKey}
          onSubmit={submit}
          noValidate
          className="grid gap-[16px] p-(--d-card-pad)"
        >
          <Field label={t("current")} error={err("current")}>
            {({ id, describedBy, invalid }) => (
              <TextInput
                id={id}
                name="current"
                type="password"
                required
                autoComplete="current-password"
                aria-describedby={describedBy}
                aria-invalid={invalid}
              />
            )}
          </Field>
          <Field label={t("next")} help={t("help")} error={err("next")}>
            {({ id, describedBy, invalid }) => (
              <TextInput
                id={id}
                name="next"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                aria-describedby={describedBy}
                aria-invalid={invalid}
              />
            )}
          </Field>
          <Field label={t("confirm")} error={err("confirm")}>
            {({ id, describedBy, invalid }) => (
              <TextInput
                id={id}
                name="confirm"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                aria-describedby={describedBy}
                aria-invalid={invalid}
              />
            )}
          </Field>
          {problem?.field === null && (
            <div role="alert" className="text-label font-medium text-danger-text">
              {CROSS} {problem.text}
            </div>
          )}
          <p className="m-0 text-caption text-text-muted">{t("note")}</p>
          <div>
            <Button type="submit" size="lg" disabled={busy}>
              {busy ? t("saving") : t("submit")}
            </Button>
          </div>
        </form>
      </Panel>
    </div>
  );
}
