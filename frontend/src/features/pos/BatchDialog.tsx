"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { BATCH_TONE } from "@/features/catalog/labels";
import { apiGet } from "@/lib/api/browser";
import { cn } from "@/lib/cn";

import { type BatchRow, type CartLine, inUnit, pick } from "./types";

const USABLE = new Set(["good", "near_expiry"]);

type Props = {
  line: CartLine;
  onClose: () => void;
  onChoose: (batch: { id: string; no: string } | null) => void;
};

/** Choose a specific batch instead of automatic FEFO. Expired and held batches cannot be sold. */
export function BatchDialog({ line, onClose, onChoose }: Props) {
  const t = useTranslations("pos");
  const tInv = useTranslations("inventory");
  const ar = useLocale() === "ar";
  const [rows, setRows] = useState<BatchRow[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(line.batch?.id ?? null);

  useEffect(() => {
    void apiGet<BatchRow[]>(`/inventory/items/${line.item.id}/batches/`).then((res) => {
      const list = res.ok ? res.data : [];
      setRows(list);
      if (!line.batch) setChosen(list.find((b) => USABLE.has(b.status))?.batch_id ?? null);
    });
  }, [line.item.id, line.batch]);

  const grid = "grid grid-cols-[1fr_110px_70px_130px] items-center gap-[12px] px-[12px]";
  const row = rows?.find((b) => b.batch_id === chosen);
  return (
    <Dialog open onClose={onClose} labelledBy="batch-title" className="w-[560px] gap-[12px]">
      <div id="batch-title" className="text-[16px] font-medium">
        {t("batchTitle", { item: `${pick(ar, line.item)} ${line.item.strength}`.trim() })}
      </div>
      <div
        className="overflow-hidden rounded-control border border-border"
        role="radiogroup"
        aria-labelledby="batch-title"
      >
        <div
          className={cn(grid, "h-[36px] bg-surface-subtle text-[12px] font-medium text-text-muted")}
        >
          <span>{t("hBatch")}</span>
          <span>{t("hExp")}</span>
          <span className="text-end">{t("hStock")}</span>
          <span>{t("hStatus")}</span>
        </div>
        {rows?.length === 0 && (
          <div className="border-t border-border p-[16px] text-center text-text-muted">
            {t("batchNone")}
          </div>
        )}
        {rows?.map((b) => {
          const usable = USABLE.has(b.status);
          return (
            <button
              key={`${b.batch_id}-${b.location}`}
              type="button"
              role="radio"
              aria-checked={chosen === b.batch_id}
              disabled={!usable}
              onClick={() => setChosen(b.batch_id)}
              className={cn(
                "type-inherit h-[44px] w-full border-0 border-t border-border text-start text-text",
                grid,
                chosen === b.batch_id ? "bg-brand-subtle" : "bg-transparent",
                usable ? "cursor-pointer" : "cursor-not-allowed opacity-60",
              )}
            >
              <span dir="ltr" className="text-start">
                {b.batch_no}
              </span>
              <span dir="ltr" className="text-[13px] tabular-nums">
                {b.expiry_date ?? ""}
              </span>
              <span dir="ltr" className="text-end tabular-nums">
                {inUnit(b.quantity_base, line.unit.factor)}
              </span>
              <span>
                <Badge tone={BATCH_TONE[b.status]} dense>
                  {tInv(`batch.${b.status}`)}
                </Badge>
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex justify-end gap-[8px]">
        <button
          type="button"
          onClick={() => onChoose(null)}
          className="h-[44px] cursor-pointer rounded-control border border-border-strong bg-transparent px-[20px] font-medium text-text"
        >
          {t("fefo")}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="h-[44px] cursor-pointer rounded-control border border-border-strong bg-transparent px-[20px] font-medium text-text"
        >
          {t("cancel")}
        </button>
        <button
          type="button"
          disabled={!row}
          onClick={() => row && onChoose({ id: row.batch_id, no: row.batch_no })}
          className="h-[44px] cursor-pointer rounded-control border-0 bg-brand px-[20px] font-semibold text-on-brand disabled:cursor-not-allowed disabled:bg-border disabled:text-text-muted"
        >
          {t("useBatch")}
        </button>
      </div>
    </Dialog>
  );
}
