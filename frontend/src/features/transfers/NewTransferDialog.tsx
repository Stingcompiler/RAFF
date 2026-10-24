"use client";

import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Select, TextInput } from "@/components/ui/Field";
import { apiGet, apiSend } from "@/lib/api/browser";
import type { Schemas } from "@/lib/api/types";

type ItemRow = { id: string; name_ar: string; name_en: string; strength: string };
type Line = { batchId: string; label: string; quantity: string };

type Props = {
  branches: Schemas["Branch"][];
  onClose: () => void;
  onSaved: (id: string) => void;
};

export function NewTransferDialog({ branches, onClose, onSaved }: Props) {
  const t = useTranslations("transfers");
  const ar = useLocale() === "ar";
  const [to, setTo] = useState(branches[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ItemRow[]>([]);
  const [item, setItem] = useState<ItemRow | null>(null);
  const [batches, setBatches] = useState<Schemas["BatchRow"][]>([]);
  const [batchId, setBatchId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!query.trim() || item) return;
    let live = true;
    const timer = setTimeout(async () => {
      const res = await apiGet<{ results: ItemRow[] }>(
        `/inventory/items/?limit=8&q=${encodeURIComponent(query.trim())}`,
      );
      if (live && res.ok) setItems(res.data.results);
    }, 150);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, item]);

  const choose = async (row: ItemRow) => {
    setItem(row);
    const res = await apiGet<Schemas["BatchRow"][]>(`/inventory/items/${row.id}/batches/`);
    const sellable = res.ok
      ? res.data.filter((b) => b.location === "sellable" && b.status !== "expired")
      : [];
    setBatches(sellable);
    setBatchId(sellable[0]?.batch_id ?? "");
  };

  const add = () => {
    const batch = batches.find((b) => b.batch_id === batchId);
    if (!item || !batch || !(Number(quantity) > 0)) return;
    const label = [ar ? item.name_ar : item.name_en, item.strength, batch.batch_no]
      .filter(Boolean)
      .join(" · ");
    setLines((prev) => [...prev, { batchId, label, quantity }]);
    setItem(null);
    setQuery("");
    setBatches([]);
    setQuantity("1");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!to || lines.length === 0) return;
    setBusy(true);
    const res = await apiSend<{ id: string }>("POST", "/transfers/", {
      to_branch_id: to,
      lines: lines.map((l) => ({ batch_id: l.batchId, quantity: Number(l.quantity) })),
    });
    setBusy(false);
    if (res.ok) onSaved(res.data.id);
    else setError(t("errors.failed"));
  };

  return (
    <Dialog
      open
      onClose={busy ? undefined : onClose}
      labelledBy="new-transfer"
      className="w-[600px]"
    >
      <form onSubmit={submit} className="grid gap-[14px]">
        <div id="new-transfer" className="text-lead font-medium">
          {t("newTitle")}
        </div>
        <label className="grid gap-[4px] type-label text-text-secondary">
          {t("to")}
          <Select value={to} onChange={(e) => setTo(e.target.value)}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {ar ? b.name_ar : b.name_en}
              </option>
            ))}
          </Select>
        </label>
        <div className="grid grid-cols-[minmax(0,1fr)_140px_90px_auto] items-end gap-[8px] max-[600px]:grid-cols-2">
          <label className="grid gap-[4px] type-label text-text-secondary">
            {t("searchItem")}
            <TextInput
              value={item ? (ar ? item.name_ar : item.name_en) : query}
              onChange={(e) => {
                setItem(null);
                setQuery(e.target.value);
              }}
            />
          </label>
          <label className="grid gap-[4px] type-label text-text-secondary">
            {t("batch")}
            <Select value={batchId} onChange={(e) => setBatchId(e.target.value)} disabled={!item}>
              {batches.map((b) => (
                <option key={b.batch_id} value={b.batch_id}>
                  {[b.batch_no, b.expiry_date ?? ""].filter(Boolean).join(" · ")}
                </option>
              ))}
            </Select>
          </label>
          <label className="grid gap-[4px] type-label text-text-secondary">
            {t("quantity")}
            <TextInput
              className="num"
              dir="ltr"
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>
          <Button variant="outline" onClick={add} disabled={!item || !batchId}>
            {t("addLine")}
          </Button>
        </div>
        {!item && items.length > 0 && query.trim() && (
          <div
            role="listbox"
            aria-label={t("searchItem")}
            className="grid max-h-[160px] overflow-y-auto rounded-control border border-border"
          >
            {items.map((row) => (
              <button
                key={row.id}
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => void choose(row)}
                className="type-inherit min-h-[40px] cursor-pointer border-0 border-b border-border bg-transparent px-[12px] text-start text-text hover:bg-brand-subtle"
              >
                {ar ? row.name_ar : row.name_en}{" "}
                <bdi dir="ltr" className="text-text-muted num">
                  {row.strength}
                </bdi>
              </button>
            ))}
          </div>
        )}
        {lines.length > 0 && (
          <ul className="m-0 grid list-none gap-[6px] p-0">
            {lines.map((l, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-[12px] rounded-control border border-border px-[12px] py-[6px]"
              >
                <span>{l.label}</span>
                <span className="flex items-center gap-[12px]">
                  <span dir="ltr" className="num">
                    {l.quantity}
                  </span>
                  <Button
                    variant="quiet"
                    className="h-[28px] px-[8px]"
                    onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}
                  >
                    {t("remove")}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {error && (
          <div
            role="alert"
            className="rounded-control bg-danger-bg px-[12px] py-[8px] text-danger-text"
          >
            {error}
          </div>
        )}
        <div className="flex justify-end gap-[8px]">
          <Button variant="outline" size="lg" onClick={onClose} disabled={busy}>
            {t("cancel")}
          </Button>
          <Button type="submit" size="lg" disabled={busy || lines.length === 0 || !to}>
            {t("save")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
