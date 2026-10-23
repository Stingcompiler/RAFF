"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, TextInput } from "@/components/ui/Field";
import { apiSend } from "@/lib/api/browser";

import type { Supplier } from "./types";

export function SupplierDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (s: Supplier) => void;
}) {
  const t = useTranslations("purchases");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const res = await apiSend<Supplier>("POST", "/suppliers/", {
      code: f.get("code"),
      name_ar: f.get("name_ar"),
      name_en: f.get("name_en"),
      phone: f.get("phone"),
      payment_terms_days: Number(f.get("terms") || 0),
    });
    if (!res.ok) {
      setError(`✕ ${t("errors.failed")}`);
      return;
    }
    onCreated(res.data);
  }

  return (
    <Dialog open={open} onClose={onClose} labelledBy="supplier-title">
      <form onSubmit={submit} className="grid gap-[12px]">
        <div id="supplier-title" className="text-[16px] font-medium">
          {t("supplierTitle")}
        </div>
        <Field label={t("code")}>
          {({ id }) => <TextInput id={id} name="code" dir="ltr" required />}
        </Field>
        <Field label={t("nameAr")}>
          {({ id }) => <TextInput id={id} name="name_ar" dir="rtl" required />}
        </Field>
        <Field label={t("nameEn")}>
          {({ id }) => <TextInput id={id} name="name_en" dir="ltr" required />}
        </Field>
        <Field label={t("phone")}>{({ id }) => <TextInput id={id} name="phone" dir="ltr" />}</Field>
        <Field label={t("termsDays")}>
          {({ id }) => (
            <TextInput id={id} name="terms" type="number" min={0} dir="ltr" defaultValue={0} />
          )}
        </Field>
        {error && (
          <div role="alert" className="text-[13px] font-medium text-danger-text">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-[8px]">
          <Button variant="outline" size="lg" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button type="submit" size="lg">
            {t("save")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
