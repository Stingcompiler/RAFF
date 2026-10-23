"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Select, TextInput } from "@/components/ui/Field";
import { apiSend } from "@/lib/api/browser";
import type { Schemas } from "@/lib/api/types";

import { type ItemDetail, pick } from "./labels";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: (item: ItemDetail) => void;
  categories: Schemas["Category"][];
  ar: boolean;
  /** Edit this item; create a new one when absent. */
  item?: ItemDetail | null;
};

const ERROR_KEYS = [
  "code_taken",
  "barcode_taken",
  "base_unit_required",
  "duplicate_barcode",
] as const;

/** New item (with base + sale unit, barcode, price) or edit an item's details. */
export function ItemFormDialog({ open, onClose, onSaved, categories, ar, item }: Props) {
  const t = useTranslations("inventory");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editing = !!item;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? "").trim();
    const common = {
      name_ar: s("name_ar"),
      name_en: s("name_en"),
      generic_name: s("generic_name"),
      strength: s("strength"),
      dosage_form: s("dosage_form"),
      category_id: s("category_id") || null,
      classification: s("classification"),
      reorder_level_base: Number(s("reorder") || 0),
    };
    setBusy(true);
    setError(null);
    let res;
    if (editing) {
      res = await apiSend<ItemDetail>("PATCH", `/catalog/items/${item.id}/`, {
        ...common,
        is_active: f.get("is_active") === "on",
      });
    } else {
      const factor = Number(s("factor") || 1);
      const hasSale = !!s("sale_ar") && factor > 1;
      const barcodes = s("barcode") ? [s("barcode")] : [];
      res = await apiSend<ItemDetail>("POST", "/catalog/items/", {
        ...common,
        code: s("code"),
        units: [
          {
            code: "base",
            name_ar: s("base_ar"),
            name_en: s("base_en"),
            factor: 1,
            is_base: true,
            is_default_sale: !hasSale,
            barcodes: hasSale ? [] : barcodes,
          },
          ...(hasSale
            ? [
                {
                  code: "sale",
                  name_ar: s("sale_ar"),
                  name_en: s("sale_en") || s("sale_ar"),
                  factor,
                  is_default_sale: true,
                  barcodes,
                },
              ]
            : []),
        ],
        ...(s("price") ? { price: s("price") } : {}),
      });
    }
    setBusy(false);
    if (!res.ok) {
      const code = typeof res.error?.detail === "string" ? res.error.detail : "";
      const key = ERROR_KEYS.find((k) => k === code);
      setError(`✕ ${key ? t(`errors.${key}`) : t("errors.failed")}`);
      return;
    }
    onSaved(res.data);
  }

  const v = (k: keyof ItemDetail) => (item ? String(item[k] ?? "") : "");
  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      labelledBy="item-form-title"
      className="w-[620px]"
    >
      <form onSubmit={submit} className="grid gap-[12px]">
        <div id="item-form-title" className="text-[16px] font-medium">
          {editing ? t("edit") : t("newItem")}
        </div>
        <div className="grid max-h-[60dvh] grid-cols-2 gap-[12px] overflow-auto p-[2px] max-[600px]:grid-cols-1">
          {!editing && (
            <Field label={t("fCode")} mark="required">
              {({ id }) => <TextInput id={id} name="code" dir="ltr" required maxLength={40} />}
            </Field>
          )}
          <Field label={t("fClass")}>
            {({ id }) => (
              <Select id={id} name="classification" defaultValue={item?.classification ?? "otc"}>
                <option value="otc">{t("otc")}</option>
                <option value="rx">{t("rxLong")}</option>
              </Select>
            )}
          </Field>
          <Field label={t("fNameAr")} mark="required">
            {({ id }) => (
              <TextInput id={id} name="name_ar" dir="rtl" required defaultValue={v("name_ar")} />
            )}
          </Field>
          <Field label={t("fNameEn")} mark="required">
            {({ id }) => (
              <TextInput id={id} name="name_en" dir="ltr" required defaultValue={v("name_en")} />
            )}
          </Field>
          <Field label={t("fGeneric")}>
            {({ id }) => (
              <TextInput id={id} name="generic_name" dir="ltr" defaultValue={v("generic_name")} />
            )}
          </Field>
          <Field label={t("fCategory")}>
            {({ id }) => (
              <Select id={id} name="category_id" defaultValue={item?.category?.id ?? ""}>
                <option value="">{t("fNone")}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {pick(ar, c)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("fStrength")}>
            {({ id }) => (
              <TextInput id={id} name="strength" dir="ltr" defaultValue={v("strength")} />
            )}
          </Field>
          <Field label={t("fForm")}>
            {({ id }) => (
              <TextInput id={id} name="dosage_form" dir="ltr" defaultValue={v("dosage_form")} />
            )}
          </Field>
          {!editing && (
            <>
              <Field label={t("fBaseAr")} mark="required">
                {({ id }) => <TextInput id={id} name="base_ar" dir="rtl" required />}
              </Field>
              <Field label={t("fBaseEn")} mark="required">
                {({ id }) => <TextInput id={id} name="base_en" dir="ltr" required />}
              </Field>
              <Field label={t("fSaleAr")}>
                {({ id }) => <TextInput id={id} name="sale_ar" dir="rtl" />}
              </Field>
              <Field label={t("fSaleEn")}>
                {({ id }) => <TextInput id={id} name="sale_en" dir="ltr" />}
              </Field>
              <Field label={t("fFactor")}>
                {({ id }) => (
                  <TextInput
                    id={id}
                    name="factor"
                    type="number"
                    min={1}
                    dir="ltr"
                    defaultValue="1"
                  />
                )}
              </Field>
              <Field label={t("fBarcode")}>
                {({ id }) => <TextInput id={id} name="barcode" dir="ltr" inputMode="numeric" />}
              </Field>
              <Field label={t("fPrice")}>
                {({ id }) => (
                  <TextInput id={id} name="price" type="number" min={0} step="0.01" dir="ltr" />
                )}
              </Field>
            </>
          )}
          <Field label={t("fReorder")}>
            {({ id }) => (
              <TextInput
                id={id}
                name="reorder"
                type="number"
                min={0}
                dir="ltr"
                defaultValue={item ? String(item.reorder_level_base) : "0"}
              />
            )}
          </Field>
          {editing && (
            <label className="flex items-center gap-[8px] text-[14px]">
              <input
                type="checkbox"
                name="is_active"
                defaultChecked={item.is_active}
                className="size-[18px]"
              />
              {t("fActive")}
            </label>
          )}
        </div>
        {error && (
          <div role="alert" className="text-[13px] font-medium text-danger-text">
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
