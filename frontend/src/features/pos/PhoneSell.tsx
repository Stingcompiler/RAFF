"use client";

import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";

import { PhoneNav } from "@/components/shell/PhoneNav";
import { PhoneStatus } from "@/components/shell/PhoneStatus";
import type { ConnectionStatus } from "@/components/ui/ConnectionIndicator";
import { SearchIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";

import { sellable } from "./ResultsTable";
import { type CartLine, pick, type PosItem } from "./types";
import type { QuoteState } from "./usePosCart";

/** Items shown before the cashier searches (Raff Mobile shows a handful). */
const QUICK = 8;
/** Below this many items the catalogue is short enough that no search field is needed. */
const SEARCH_FROM = 6;
const TIMES = "×";
const SEP = "·";
const PLUS = "+";

type Props = {
  connection: { status: ConnectionStatus; text: string };
  banners: ReactNode;
  dialogs: ReactNode;
  rows: PosItem[];
  /** Items the server knows in total, to decide whether a search field helps. */
  catalogueSize: number;
  query: string;
  onQuery: (value: string) => void;
  lines: CartLine[];
  quoted: QuoteState;
  /** A storefront order's lines are fixed: nothing can be added. */
  locked: boolean;
  payDisabled: boolean;
  onAdd: (item: PosItem) => void;
  onPay: () => void;
};

/**
 * Raff Mobile › 4 · نقطة بيع مبسطة: tap an item to add it, the cart is a sheet above the
 * navigation. Prices, totals and stock all come from the server, as on the counter.
 */
export function PhoneSell(props: Props) {
  const t = useTranslations("phone.sell");
  const ar = useLocale() === "ar";
  const cur = (v: string) => money(v, ar ? "ar" : "en") || money("0", ar ? "ar" : "en");
  const [open, setOpen] = useState(false);
  const { rows, lines, quoted } = props;

  const searching = props.query.trim() !== "";
  const items = rows.filter(sellable).slice(0, searching ? undefined : QUICK);
  const count = lines.reduce((sum, l) => sum + l.quantity, 0);
  const total = quoted.quote?.total ?? "0";

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-canvas text-text">
      <PhoneStatus status={props.connection.status} text={props.connection.text} />
      {props.banners}
      <h1 className="m-0 px-[16px] pt-[8px] pb-[12px] text-[26px] font-medium">{t("title")}</h1>
      {(props.catalogueSize > SEARCH_FROM || searching) && (
        <label className="mx-[16px] mb-[8px] flex h-[48px] flex-none items-center gap-[8px] rounded-card border-2 border-brand bg-surface px-[14px]">
          <SearchIcon size={20} className="flex-none text-text-muted" />
          <input
            type="search"
            dir="auto"
            aria-label={t("search")}
            placeholder={t("search")}
            autoComplete="off"
            value={props.query}
            onChange={(e) => props.onQuery(e.target.value)}
            className="min-w-0 flex-1 border-0 bg-transparent text-[16px] text-text outline-none"
          />
        </label>
      )}
      <div className="grid min-h-0 flex-1 content-start gap-[8px] overflow-y-auto px-[16px] pb-[240px]">
        {items.map((row) => (
          <button
            key={row.id}
            type="button"
            disabled={props.locked}
            aria-label={t("add", { name: pick(ar, row) })}
            onClick={() => props.onAdd(row)}
            className="flex min-h-[56px] w-full cursor-pointer items-center gap-[12px] rounded-card border border-border bg-surface px-[14px] py-[8px] text-start font-[inherit] text-[14px] text-text transition-[transform,background] duration-(--motion-feedback) disabled:cursor-default disabled:opacity-60"
          >
            <span className="min-w-0 flex-1 truncate font-medium">
              {[pick(ar, row), row.strength].filter(Boolean).join(" ")}
            </span>
            <span dir="ltr" className="text-text-muted tabular-nums">
              {row.price ? cur(row.price) : ""}
            </span>
            <span
              aria-hidden="true"
              className="grid size-[44px] flex-none place-items-center rounded-control bg-brand-subtle text-[22px]"
            >
              {PLUS}
            </span>
          </button>
        ))}
        {items.length === 0 && (
          <div className="px-[8px] py-[24px] text-center text-text-muted">{t("empty")}</div>
        )}
      </div>

      <div
        className={cn(
          "absolute inset-x-0 bottom-[68px] rounded-t-panel border-t border-border bg-surface shadow-sheet",
          "transition-transform duration-(--motion-panel-in) ease-[cubic-bezier(.2,.8,.2,1)]",
          open ? "translate-y-0" : "translate-y-[212px]",
        )}
      >
        <button
          type="button"
          aria-expanded={open}
          aria-label={t("toggle")}
          onClick={() => setOpen((v) => !v)}
          className="block w-full cursor-pointer border-0 bg-transparent px-[16px] pt-[10px] pb-0 text-start font-[inherit] text-[14px] text-text"
        >
          <span
            aria-hidden="true"
            className="mx-auto mb-[10px] block h-[4px] w-[40px] rounded-[2px] bg-border"
          />
          <span className="flex h-[52px] items-center gap-[12px]">
            <span className="flex-1 font-medium">
              {t("cart")} {SEP}{" "}
              <b dir="ltr" data-testid="phone-cart-count">
                {count}
              </b>
            </span>
            <span
              dir="ltr"
              className="text-[22px] font-medium tabular-nums"
              data-testid="phone-cart-total"
            >
              {cur(total)}
            </span>
          </span>
        </button>
        <div className="px-[16px] py-[12px]">
          <button
            type="button"
            disabled={props.payDisabled}
            onClick={props.onPay}
            className="h-[52px] w-full cursor-pointer rounded-card border-0 bg-brand font-[inherit] text-[16px] font-semibold text-on-brand transition-transform duration-(--motion-feedback) disabled:cursor-default disabled:opacity-60"
          >
            {t("pay")}
          </button>
        </div>
        <div
          inert={!open}
          className="grid h-[210px] content-start gap-[6px] overflow-y-auto px-[16px] pb-[8px]"
        >
          {lines.map((l) => {
            const priced = quoted.byKey[l.key];
            return (
              <div
                key={l.key}
                className="flex min-h-[44px] animate-[raff-rise_.25s_ease_both] items-center gap-[12px] border-t border-border"
              >
                <span className="min-w-0 flex-1 truncate">{pick(ar, l.item)}</span>
                <span dir="ltr" className="text-text-muted">
                  {TIMES} {l.quantity}
                </span>
                <span dir="ltr" className="font-semibold tabular-nums">
                  {priced ? cur(priced.line_total) : ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <PhoneNav activePath="/pos" className="absolute inset-x-0 bottom-0 z-[2]" />
      {props.dialogs}
    </div>
  );
}
