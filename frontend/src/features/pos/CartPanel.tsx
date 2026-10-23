"use client";

import { useLocale, useTranslations } from "next-intl";

import { ChevronDownIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";

import type { QuoteState } from "./usePosCart";
import { type CartLine, errorKey, inUnit, pick } from "./types";

const REMOVE = "✕";
const MINUS = "−";
const PLUS = "+";
const PERCENT = "%";
const CARET = "▾";
const F8 = "F8";
const F4 = "F4";
const MAX_QTY = 999;

type Props = {
  fromOrder?: { number: string; customer_name: string } | null;
  lines: CartLine[];
  quoted: QuoteState;
  customerName: string | null;
  canDiscount: boolean;
  payDisabled: boolean;
  onChange: (key: string, patch: Partial<CartLine>) => void;
  onRemove: (key: string) => void;
  onBatch: (key: string) => void;
  onPay: () => void;
  onHold: () => void;
};

const digits = (text: string, max: number) =>
  Math.min(max, parseInt(text.replace(/\D/g, ""), 10) || 0);

export function CartPanel(props: Props) {
  const { lines, quoted, customerName, canDiscount, payDisabled } = props;
  const t = useTranslations("pos");
  const tErr = useTranslations("pos.errors");
  const ar = useLocale() === "ar";
  const cur = (v: string | null | undefined) =>
    money(v ?? "0", ar ? "ar" : "en") || money("0", ar ? "ar" : "en");
  const q = quoted.quote;

  return (
    <aside className="flex min-w-[420px] flex-[38] flex-col border-s border-border bg-surface-subtle max-[1023px]:min-h-0 max-[1023px]:min-w-0 max-[1023px]:flex-[1_1_50%] max-[1023px]:border-s-0 max-[1023px]:border-t">
      {props.fromOrder && (
        <div
          data-testid="from-order"
          className="flex flex-none items-center gap-[8px] border-b border-border bg-info-bg px-[16px] py-[10px] font-medium text-info-text"
        >
          <span className="min-w-0 flex-1 truncate">
            {t("fromOrder", {
              number: props.fromOrder.number,
              name: props.fromOrder.customer_name,
            })}
          </span>
          <span className="text-[12px] whitespace-nowrap">{t("locked")}</span>
        </div>
      )}
      <div className="flex items-center justify-between border-b border-border px-[16px] py-[12px]">
        <span className="text-[16px] font-medium">{t("cart")}</span>
        <span className="flex items-center gap-[6px] rounded-control border border-border bg-surface px-[12px] py-[6px] text-[13px]">
          {customerName ?? t("customer")}
          <ChevronDownIcon size={14} />
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-[8px] overflow-y-auto px-[12px] py-[8px]">
        {lines.length === 0 && (
          <div className="grid flex-1 place-content-center gap-[8px] text-center text-text-muted">
            <div className="text-[16px] font-medium text-text">{t("emptyCart")}</div>
            <div>{t("emptyHint")}</div>
          </div>
        )}
        {lines.map((line) => {
          const ql = quoted.byKey[line.key];
          const unitName = pick(ar, line.unit);
          const unitChip = [unitName, CARET].join(" ");
          const base = line.item.units.find((u) => u.is_base);
          const short = ql && ql.available_base < ql.base_quantity;
          const lineError =
            quoted.error && quoted.error.key === line.key
              ? tErr(errorKey(quoted.error.code))
              : null;
          const error =
            line.quantity < 1
              ? t("enterQty")
              : short
                ? t("insufficient", { available: inUnit(ql.available_base, line.unit.factor) })
                : lineError;
          return (
            <div
              key={line.key}
              data-testid="cart-line"
              className="grid gap-[8px] rounded-control border border-border bg-surface px-[12px] py-[10px]"
            >
              <div className="flex items-center gap-[8px]">
                <button
                  type="button"
                  aria-label={t("del")}
                  disabled={line.locked}
                  onClick={() => props.onRemove(line.key)}
                  className="type-inherit -m-[6px] grid size-[44px] flex-none cursor-pointer place-items-center rounded-control border-0 bg-transparent p-0 text-text-muted transition-[background,color] duration-(--motion-feedback) hover:bg-danger-bg hover:text-danger-text"
                >
                  {REMOVE}
                </button>
                <span className="min-w-0 flex-1 font-medium">
                  {pick(ar, line.item)}{" "}
                  <bdi dir="ltr" className="text-[12px] text-text-muted [unicode-bidi:isolate]">
                    {line.item.strength}
                  </bdi>{" "}
                  {line.item.rx && (
                    <span className="flex-none rounded-[4px] border border-info-solid px-[4px] font-latin text-[11px] font-semibold text-info-text">
                      {t("rx")}
                    </span>
                  )}
                </span>
                <span dir="ltr" className="font-semibold tabular-nums" data-testid="line-total">
                  {ql ? cur(ql.line_total) : ""}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-[8px] text-[12px] whitespace-nowrap text-text-muted">
                <label className="relative rounded-control border border-border px-[8px] py-[3px] text-text">
                  {unitChip}
                  <select
                    aria-label={t("hUnit")}
                    disabled={line.locked}
                    value={line.unit.id}
                    onChange={(e) => {
                      const unit = line.item.units.find((u) => u.id === e.target.value);
                      if (unit) props.onChange(line.key, { unit });
                    }}
                    className="absolute inset-0 cursor-pointer opacity-0"
                  >
                    {line.item.units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {pick(ar, u)}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={line.locked}
                  onClick={() => props.onBatch(line.key)}
                  className="type-inherit cursor-pointer rounded-control border border-dashed border-border bg-transparent px-[8px] py-[3px] text-text"
                >
                  {line.locked
                    ? t("locked")
                    : line.batch
                      ? line.batch.no || t("batchChosen")
                      : t("fefo")}
                </button>
                <span dir="ltr" className="tabular-nums">
                  {ql ? cur(ql.unit_price) : ""}
                </span>
                <label
                  className={cn(
                    "flex items-center gap-[2px] rounded-control border px-[8px] py-[3px]",
                    line.discountPct
                      ? "border-success-solid text-success-text"
                      : "border-border text-text",
                  )}
                >
                  {t("discL")}{" "}
                  <input
                    dir="ltr"
                    type="text"
                    inputMode="numeric"
                    aria-label={t("discL")}
                    value={line.discountPct}
                    disabled={!canDiscount || line.locked}
                    onChange={(e) =>
                      props.onChange(line.key, { discountPct: digits(e.target.value, 100) })
                    }
                    className="w-[30px] border-0 bg-transparent p-0 text-center text-inherit outline-none [font:inherit]"
                  />
                  {PERCENT}
                </label>
                {line.unit.factor > 1 && base && (
                  <span className="text-[12px]">
                    {t("conv", { unit: unitName, factor: line.unit.factor, base: pick(ar, base) })}
                  </span>
                )}
                <span className="ms-auto flex items-center overflow-hidden rounded-control border border-border text-[14px] text-text">
                  <button
                    type="button"
                    aria-label={t("decrease")}
                    disabled={line.locked}
                    onClick={() =>
                      props.onChange(line.key, { quantity: Math.max(1, line.quantity - 1) })
                    }
                    className="type-inherit grid size-[40px] cursor-pointer place-items-center border-0 bg-surface-subtle p-0 text-text"
                  >
                    {MINUS}
                  </button>
                  <input
                    dir="ltr"
                    type="text"
                    inputMode="numeric"
                    aria-label={t("qtyL")}
                    readOnly={line.locked}
                    value={line.quantity}
                    onChange={(e) =>
                      props.onChange(line.key, { quantity: digits(e.target.value, MAX_QTY) })
                    }
                    className={cn(
                      "h-[40px] w-[48px] border-0 text-center font-sans text-[14px] font-semibold tabular-nums outline-none",
                      error && !lineError
                        ? "bg-danger-bg text-danger-text"
                        : "bg-surface text-text",
                    )}
                  />
                  <button
                    type="button"
                    aria-label={t("increase")}
                    disabled={line.locked}
                    onClick={() =>
                      props.onChange(line.key, {
                        quantity: Math.min(MAX_QTY, line.quantity + 1),
                      })
                    }
                    className="type-inherit grid size-[40px] cursor-pointer place-items-center border-0 bg-surface-subtle p-0 text-text"
                  >
                    {PLUS}
                  </button>
                </span>
                {error && (
                  <span
                    role="alert"
                    className="basis-full text-[12px] font-medium text-danger-text"
                  >
                    {error}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="grid gap-[8px] border-t border-border bg-surface p-[16px]">
        <div className="flex justify-between text-text-muted">
          <span>{t("sub")}</span>
          <span dir="ltr" className="tabular-nums">
            {cur(q?.subtotal)}
          </span>
        </div>
        <div className="flex justify-between text-text-muted">
          <span>{t("disc")}</span>
          <span dir="ltr" className="tabular-nums">
            {cur(q?.discount_total)}
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="font-medium">{t("total")}</span>
          <span dir="ltr" className="text-[32px] font-medium tabular-nums" data-testid="cart-total">
            {cur(q?.total)}
          </span>
        </div>
        <button
          type="button"
          onClick={props.onPay}
          disabled={payDisabled}
          className={cn(
            "flex h-[52px] items-center justify-center gap-[12px] rounded-control border-0 text-[18px] font-semibold",
            payDisabled
              ? "cursor-not-allowed bg-border text-text-muted"
              : "cursor-pointer bg-brand text-on-brand",
          )}
        >
          {t("pay")}{" "}
          <span dir="ltr" className="text-[13px] opacity-85">
            {F8}
          </span>
        </button>
        <button
          type="button"
          onClick={props.onHold}
          className="h-[44px] cursor-pointer rounded-control border border-border-strong bg-transparent text-[14px] font-medium text-text"
        >
          {t("hold")}{" "}
          <span dir="ltr" className="text-[12px] text-text-muted">
            {F4}
          </span>
        </button>
      </div>
    </aside>
  );
}
