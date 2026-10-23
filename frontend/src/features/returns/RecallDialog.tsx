"use client";

import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Select, TextInput } from "@/components/ui/Field";
import { apiGet, apiSend } from "@/lib/api/browser";
import type { Schemas } from "@/lib/api/types";

import { errorCode, errorKey } from "./types";

type ItemRow = { id: string; code: string; name_ar: string; name_en: string; strength: string };

/** Recall: hold every unit of one batch in this branch. */
export function RecallDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const t = useTranslations("returns");
  const tErr = useTranslations("returns.errors");
  const ar = useLocale() === "ar";
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ItemRow[]>([]);
  const [item, setItem] = useState<ItemRow | null>(null);
  const [batches, setBatches] = useState<Schemas["BatchRow"][]>([]);
  const [batchId, setBatchId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key] = useState(() => crypto.randomUUID());

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
    const list = res.ok ? res.data.filter((b) => b.location !== "quarantine") : [];
    setBatches(list);
    setBatchId(list[0]?.batch_id ?? "");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!batchId || !reason.trim()) return;
    setBusy(true);
    const res = await apiSend(
      "POST",
      "/quarantine/recall/",
      { batch_id: batchId, reason: reason.trim() },
      { idempotencyKey: key },
    );
    setBusy(false);
    if (res.ok) onDone();
    else setError(tErr(errorKey(errorCode(res.error))));
  };

  const unique = [...new Map(batches.map((b) => [b.batch_id, b])).values()];
  return (
    <Dialog
      open
      onClose={busy ? undefined : onClose}
      labelledBy="recall-title"
      className="w-[520px]"
    >
      <form onSubmit={submit} className="grid gap-[14px]">
        <div id="recall-title" className="text-[16px] font-medium">
          {t("recallTitle")}
        </div>
        <div className="text-text-muted">{t("recallBody")}</div>
        <label className="grid gap-[4px] text-[12px] font-medium text-text-muted">
          {t("searchItem")}
          <TextInput
            value={item ? (ar ? item.name_ar : item.name_en) : query}
            onChange={(e) => {
              setItem(null);
              setBatches([]);
              setQuery(e.target.value);
            }}
          />
        </label>
        {!item && items.length > 0 && (
          <div
            role="listbox"
            aria-label={t("searchItem")}
            className="grid max-h-[180px] overflow-y-auto rounded-[8px] border border-border"
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
                <bdi dir="ltr" className="text-text-muted">
                  {row.strength}
                </bdi>
              </button>
            ))}
          </div>
        )}
        {item && (
          <label className="grid gap-[4px] text-[12px] font-medium text-text-muted">
            {t("pickBatch")}
            <Select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
              {unique.map((b) => (
                <option key={b.batch_id} value={b.batch_id}>
                  {[b.batch_no, b.expiry_date ?? ""].filter(Boolean).join(" · ")}
                </option>
              ))}
            </Select>
          </label>
        )}
        <label className="grid gap-[4px] text-[12px] font-medium text-text-muted">
          {t("recallReason")}
          <TextInput value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        {error && (
          <div
            role="alert"
            className="rounded-[8px] bg-danger-bg px-[12px] py-[8px] text-danger-text"
          >
            {error}
          </div>
        )}
        <div className="flex justify-end gap-[8px]">
          <Button variant="outline" size="lg" onClick={onClose} disabled={busy}>
            {t("cancel")}
          </Button>
          <Button type="submit" size="lg" disabled={busy || !batchId || !reason.trim()}>
            {busy ? t("approving") : t("recall")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
