"use client";

import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Select, TextInput } from "@/components/ui/Field";
import { apiGet } from "@/lib/api/browser";
import type { Schemas } from "@/lib/api/types";
import { cn } from "@/lib/cn";

import type { LineDraft } from "./types";

type Item = Schemas["ItemDetail"];
type Props = {
  open: boolean;
  line: LineDraft | null;
  onClose: () => void;
  onSave: (line: LineDraft) => void;
  onRemove?: () => void;
};

/** Add or edit one receipt line: item search, unit, quantities, cost, batch, expiry. */
export function LineDialog({ open, line, onClose, onSave, onRemove }: Props) {
  const t = useTranslations("purchases");
  const ar = useLocale() === "ar";
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Schemas["ItemList"][]>([]);
  const [item, setItem] = useState<Item | null>(null);

  useEffect(() => {
    if (!open || !line) return;
    void apiGet<Item>(`/catalog/items/${line.item_id}/`).then((r) => r.ok && setItem(r.data));
  }, [open, line]);

  const searching = open && !line && query.trim().length >= 2;

  useEffect(() => {
    if (!searching) return;
    const timer = setTimeout(() => {
      void apiGet<{ results: Schemas["ItemList"][] }>(
        `/catalog/items/?limit=8&q=${encodeURIComponent(query)}`,
      ).then((r) => r.ok && setResults(r.data.results));
    }, 200);
    return () => clearTimeout(timer);
  }, [searching, query]);

  function close() {
    setQuery("");
    setItem(null);
    onClose();
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!item) return;
    const f = new FormData(e.currentTarget);
    const unit = item.units.find((u) => u.id === f.get("unit")) ?? item.units[0]!;
    onSave({
      item_id: item.id,
      unit_id: unit.id,
      item_name_ar: item.name_ar,
      item_name_en: item.name_en,
      unit_name_ar: unit.name_ar,
      unit_name_en: unit.name_en,
      quantity: Number(f.get("quantity")),
      bonus_quantity: Number(f.get("bonus") || 0),
      unit_cost: String(f.get("cost")),
      discount: String(f.get("discount") || "0"),
      batch_no: String(f.get("batch")).trim(),
      expiry_date: String(f.get("expiry") || "") || null,
    });
    setQuery("");
    setItem(null);
  }

  return (
    <Dialog open={open} onClose={close} labelledBy="line-title" className="w-[560px]">
      <form onSubmit={submit} className="grid gap-[12px]">
        <div id="line-title" className="text-lead font-medium">
          {t("lineTitle")}
        </div>
        {!line && !item && (
          <div className="grid gap-[6px]">
            <Field label={t("searchItem")}>
              {({ id }) => (
                <TextInput
                  id={id}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoComplete="off"
                />
              )}
            </Field>
            <div role="listbox" aria-label={t("searchItem")} className="grid">
              {(searching ? results : []).map((r) => (
                <button
                  key={r.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() =>
                    void apiGet<Item>(`/catalog/items/${r.id}/`).then(
                      (x) => x.ok && setItem(x.data),
                    )
                  }
                  className="min-h-[40px] cursor-pointer rounded-control border-0 bg-transparent px-[12px] text-start type-inherit text-text hover:bg-surface-subtle"
                >
                  {ar ? `${r.name_ar} · ${r.name_en}` : r.name_en}
                </button>
              ))}
            </div>
          </div>
        )}
        {item && (
          <>
            <div className="font-medium">
              {ar ? `${item.name_ar} · ${item.name_en}` : item.name_en}
            </div>
            <div className="grid grid-cols-2 gap-[12px] max-[480px]:grid-cols-1">
              <Field label={t("unit")}>
                {({ id }) => (
                  <Select id={id} name="unit" defaultValue={line?.unit_id ?? item.sale_unit?.id}>
                    {item.units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {ar ? u.name_ar : u.name_en}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label={t("quantity")}>
                {({ id }) => (
                  <TextInput
                    className="num"
                    id={id}
                    name="quantity"
                    type="number"
                    min={1}
                    dir="ltr"
                    required
                    defaultValue={line?.quantity}
                  />
                )}
              </Field>
              <Field label={t("bonusQty")}>
                {({ id }) => (
                  <TextInput
                    className="num"
                    id={id}
                    name="bonus"
                    type="number"
                    min={0}
                    dir="ltr"
                    defaultValue={line?.bonus_quantity ?? 0}
                  />
                )}
              </Field>
              <Field label={t("unitCost")}>
                {({ id }) => (
                  <TextInput
                    className="num"
                    id={id}
                    name="cost"
                    type="number"
                    min={0}
                    step="0.0001"
                    dir="ltr"
                    required
                    defaultValue={line ? Number(line.unit_cost) : undefined}
                  />
                )}
              </Field>
              <Field label={t("discount")}>
                {({ id }) => (
                  <TextInput
                    className="num"
                    id={id}
                    name="discount"
                    type="number"
                    min={0}
                    step="0.0001"
                    dir="ltr"
                    defaultValue={line ? Number(line.discount) : 0}
                  />
                )}
              </Field>
              <Field label={t("batch")}>
                {({ id }) => (
                  <TextInput
                    className="num"
                    id={id}
                    name="batch"
                    dir="ltr"
                    required
                    defaultValue={line?.batch_no}
                  />
                )}
              </Field>
              <Field label={t("expiry")} help={t("expiryHelp")} className="col-span-2">
                {({ id, describedBy }) => (
                  <TextInput
                    className="num"
                    id={id}
                    name="expiry"
                    type="date"
                    dir="ltr"
                    aria-describedby={describedBy}
                    defaultValue={line?.expiry_date ?? ""}
                  />
                )}
              </Field>
            </div>
          </>
        )}
        <div className={cn("flex gap-[8px]", onRemove ? "justify-between" : "justify-end")}>
          {onRemove && (
            <Button variant="danger" size="lg" onClick={onRemove}>
              {t("remove")}
            </Button>
          )}
          <div className="flex gap-[8px]">
            <Button variant="outline" size="lg" onClick={close}>
              {t("cancel")}
            </Button>
            <Button type="submit" size="lg" disabled={!item}>
              {t("save")}
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
