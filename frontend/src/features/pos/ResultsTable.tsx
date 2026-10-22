"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { STOCK_TONE } from "@/features/catalog/labels";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";

import { inUnit, pick, type PosItem } from "./types";

// Two layouts from the design: the form column drops below 1280px.
const COLS =
  "grid-cols-[minmax(0,1fr)_52px_84px_88px_150px] min-[1280px]:grid-cols-[minmax(0,1fr)_96px_56px_88px_96px_172px]";
const FORM_COL = "hidden min-[1280px]:block";
const NAV_KEYS = "↑↓";
const ENTER = "Enter";
const SEP = " · ";

export const sellable = (row: PosItem) =>
  row.status !== "out" && row.status !== "expired" && row.sellable_base > 0;

type Props = {
  rows: PosItem[];
  selected: number;
  query: string;
  onSelect: (index: number) => void;
  onAdd: (row: PosItem) => void;
  onLogMissing: () => void;
};

export function ResultsTable({ rows, selected, query, onSelect, onAdd, onLogMissing }: Props) {
  const t = useTranslations("pos");
  const ar = useLocale() === "ar";
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>(`[data-index="${selected}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const noResults = query.trim() !== "" && rows.length === 0;
  const navHint = [NAV_KEYS, t("nav")].join(" ");
  const addHint = [ENTER, t("add")].join(" ");
  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-[12px] border border-line bg-surface">
      <div
        className={cn(
          "grid h-[36px] items-center gap-[12px] border-b border-line bg-surface-raised px-[16px] text-[12px] font-medium text-muted",
          COLS,
        )}
      >
        <span>{t("hItem")}</span>
        <span className={cn(FORM_COL, "text-start")}>{t("hForm")}</span>
        <span>{t("hUnit")}</span>
        <span className="text-end">{t("hPrice")}</span>
        <span className="text-end">{t("hStock")}</span>
        <span>{t("hExp")}</span>
      </div>
      {noResults && (
        <div className="grid flex-1 place-content-center justify-items-center gap-[12px] p-[24px] text-center">
          <div className="text-[16px] font-medium">{t("noRes", { query })}</div>
          <div className="max-w-[360px] text-muted">{t("noResHint")}</div>
          <Button variant="outline" onClick={onLogMissing}>
            {t("logMissing")}
          </Button>
        </div>
      )}
      <div ref={list} role="listbox" aria-label={t("hItem")} className="min-h-0 overflow-y-auto">
        {rows.map((row, index) => {
          const on = index === selected;
          const unitName = row.unit ? pick(ar, row.unit) : "";
          const secondary = [row.name_en, row.strength].join(SEP);
          const stock = [inUnit(row.sellable_base, row.unit?.factor), unitName].join(" ");
          return (
            <div
              key={row.id}
              role="option"
              aria-selected={on}
              aria-disabled={!sellable(row)}
              data-index={index}
              onMouseEnter={() => onSelect(index)}
              onClick={() => sellable(row) && onAdd(row)}
              className={cn(
                "grid h-[44px] items-center gap-[12px] border-b border-line px-[16px] transition-[background] duration-[180ms]",
                COLS,
                on && "bg-accent text-ink",
                sellable(row) ? "cursor-pointer" : "cursor-not-allowed",
              )}
            >
              <div className="grid min-w-0 leading-[1.25]">
                <span className="flex min-w-0 items-center gap-[6px]">
                  {row.rx && (
                    <span className="flex-none rounded-[4px] border border-info px-[4px] font-latin text-[11px] font-semibold text-info">
                      {t("rx")}
                    </span>
                  )}
                  <span className="truncate font-medium">{pick(ar, row)}</span>
                </span>
                <span
                  dir="ltr"
                  className={cn(
                    "truncate text-start text-[12px] [unicode-bidi:isolate]",
                    on ? "text-ink" : "text-muted",
                  )}
                >
                  <span className="min-[1280px]:hidden">{secondary}</span>
                  <span className="hidden min-[1280px]:inline">{row.name_en}</span>
                </span>
              </div>
              <span
                dir="ltr"
                className={cn(FORM_COL, "text-start text-[13px] [unicode-bidi:isolate]")}
              >
                {[row.strength, row.dosage_form].filter(Boolean).join(SEP)}
              </span>
              <span>{unitName}</span>
              <span dir="ltr" className="text-end tabular-nums [unicode-bidi:isolate]">
                {money(row.price, ar ? "ar" : "en")}
              </span>
              <span className="text-end whitespace-nowrap tabular-nums">{stock}</span>
              <span className="flex items-center gap-[6px] whitespace-nowrap">
                <span dir="ltr" className="text-[12px] tabular-nums">
                  {row.nearest_expiry ?? ""}
                </span>
                <Badge tone={STOCK_TONE[row.status]} dense>
                  {t(`status.${row.status}`)}
                </Badge>
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-auto flex gap-[16px] border-t border-line px-[16px] py-[10px] text-[12px] text-muted">
        <span>{navHint}</span>
        <span>{addHint}</span>
        <span>{t("rule")}</span>
      </div>
    </div>
  );
}
