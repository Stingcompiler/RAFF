"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Select, TextInput } from "@/components/ui/Field";
import { apiSend } from "@/lib/api/browser";

import { type ItemDetail, pick } from "./labels";

/** Record a new price version for one unit (never edits an existing version). */
export function PriceDialog({
  item,
  ar,
  open,
  onClose,
  onSaved,
}: {
  item: ItemDetail;
  ar: boolean;
  open: boolean;
  onClose: () => void;
  onSaved: (item: ItemDetail) => void;
}) {
  const t = useTranslations("inventory");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const res = await apiSend<ItemDetail>("POST", `/catalog/items/${item.id}/prices/`, {
      unit_id: f.get("unit_id"),
      price_list: f.get("price_list"),
      price: f.get("price"),
      effective_from: f.get("effective_from"),
    });
    setBusy(false);
    if (!res.ok) {
      const exists = res.error?.detail === "price_exists_for_date";
      setError(`✕ ${exists ? t("errors.price_exists_for_date") : t("errors.failed")}`);
      return;
    }
    onSaved(res.data);
  }

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} labelledBy="price-title">
      <form onSubmit={submit} className="grid gap-[12px]">
        <div id="price-title" className="text-[16px] font-medium">
          {t("newPrice")}
        </div>
        <Field label={t("baseUnit")}>
          {({ id }) => (
            <Select id={id} name="unit_id" defaultValue={item.sale_unit?.id}>
              {item.units.map((u) => (
                <option key={u.id} value={u.id}>
                  {pick(ar, u)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("tabPrices")}>
          {({ id }) => (
            <Select id={id} name="price_list" defaultValue="retail">
              <option value="retail">{t("retail")}</option>
              <option value="wholesale">{t("wholesale")}</option>
            </Select>
          )}
        </Field>
        <Field label={t("fPrice")}>
          {({ id }) => (
            <TextInput id={id} name="price" type="number" min={0} step="0.01" dir="ltr" required />
          )}
        </Field>
        <Field label={t("fPriceDate")}>
          {({ id }) => (
            <TextInput
              id={id}
              name="effective_from"
              type="date"
              dir="ltr"
              defaultValue={today}
              required
            />
          )}
        </Field>
        {error && (
          <div role="alert" className="text-[13px] font-medium text-danger">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-[8px]">
          <Button variant="outline" size="lg" disabled={busy} onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? t("saving") : t("save")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
