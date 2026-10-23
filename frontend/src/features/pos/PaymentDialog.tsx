"use client";

import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useEffect, useState } from "react";

import { Dialog } from "@/components/ui/Dialog";
import { apiGet } from "@/lib/api/browser";
import { cn } from "@/lib/cn";
import { cleanAmount, isNegative, subtract, toUnits } from "@/lib/decimal";
import { money } from "@/lib/format";

import { type Customer, type Method, type PaymentIn, pick, type SaleRequest } from "./types";

const METHODS: Method[] = ["cash", "bank", "credit", "split"];
const ESC = "Esc";

type Props = {
  open: boolean;
  total: string;
  busy: boolean;
  error: string | null;
  lines: SaleRequest["lines"];
  onClose: () => void;
  onConfirm: (request: SaleRequest, customer: Customer | null) => void;
};

/** Whole currency for the tendered field's first value, e.g. "12500.0000" → "12500". */
const whole = (value: string) => value.replace(/\.0+$/, "");

const FIELD =
  "h-[44px] w-full rounded-[8px] border-2 border-brand bg-canvas px-[12px] text-[18px] font-medium text-text outline-none";
const LABEL = "grid gap-[4px] text-[12px] font-medium text-text-muted";

export function PaymentDialog({ open, total, busy, error, lines, onClose, onConfirm }: Props) {
  const t = useTranslations("pos");
  const ar = useLocale() === "ar";
  const cur = (v: string) => money(v, ar ? "ar" : "en") || money("0", ar ? "ar" : "en");
  const [method, setMethod] = useState<Method>("cash");
  const [tendered, setTendered] = useState(whole(total));
  const [reference, setReference] = useState("");
  const [account, setAccount] = useState("");
  const [cashPart, setCashPart] = useState("");
  const [search, setSearch] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);

  useEffect(() => {
    if (method !== "credit" || !search.trim() || customer) return;
    let live = true;
    const timer = setTimeout(async () => {
      const res = await apiGet<Customer[]>(`/customers/?q=${encodeURIComponent(search.trim())}`);
      if (live && res.ok) setCustomers(res.data);
    }, 150);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [method, search, customer]);

  const change = subtract(tendered || "0", total);
  const bankPart = subtract(total, cashPart || "0");
  const creditLeft = customer
    ? subtract(customer.credit_limit ?? "0", customer.balance, total)
    : "0";

  const payments = (): PaymentIn[] | null => {
    switch (method) {
      case "cash":
        return isNegative(change)
          ? null
          : [{ method: "cash", amount: total, tendered, bank_reference: "", bank_account: "" }];
      case "bank":
        return reference.trim()
          ? [
              {
                method: "bank",
                amount: total,
                bank_reference: reference.trim(),
                bank_account: account.trim(),
              },
            ]
          : null;
      case "credit":
        return customer
          ? [{ method: "credit", amount: total, bank_reference: "", bank_account: "" }]
          : null;
      case "split":
        if (!cashPart || toUnits(cashPart) <= 0n || isNegative(bankPart) || !reference.trim())
          return null;
        return [
          {
            method: "cash",
            amount: cashPart,
            tendered: cashPart,
            bank_reference: "",
            bank_account: "",
          },
          {
            method: "bank",
            amount: bankPart,
            bank_reference: reference.trim(),
            bank_account: account.trim(),
          },
        ];
    }
  };
  const ready = payments();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const p = payments();
    if (!p || busy) return;
    onConfirm(
      { lines, payments: p, customer_id: method === "credit" ? (customer?.id ?? null) : null },
      method === "credit" ? customer : null,
    );
  };

  const bankFields = (
    <div className="grid grid-cols-2 gap-[12px]">
      <label className={LABEL}>
        {t("ref")}
        <input
          dir="ltr"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          className={FIELD}
        />
      </label>
      <label className={LABEL}>
        {t("account")}
        <input
          dir="ltr"
          value={account}
          placeholder={t("bankA")}
          onChange={(e) => setAccount(e.target.value)}
          className="h-[44px] w-full rounded-[8px] border border-border-strong bg-canvas px-[12px] text-[14px] text-text outline-none"
        />
      </label>
    </div>
  );

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      labelledBy="pay-title"
      className="w-[560px] gap-[16px]"
    >
      <form onSubmit={submit} className="grid gap-[16px]">
        <div className="flex items-center justify-between">
          <span id="pay-title" className="text-[16px] font-medium">
            {t("payTitle")}
          </span>
          <span className="text-[12px] text-text-muted">{ESC}</span>
        </div>
        <div className="rounded-[10px] bg-surface-subtle p-[12px] text-center">
          <div className="text-[13px] text-text-muted">{t("total")}</div>
          <div dir="ltr" className="text-[40px] font-medium tabular-nums" data-testid="pay-total">
            {cur(total)}
          </div>
        </div>
        <div role="radiogroup" aria-label={t("payTitle")} className="grid grid-cols-4 gap-[8px]">
          {METHODS.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={method === m}
              disabled={busy}
              onClick={() => setMethod(m)}
              className={cn(
                "type-inherit grid h-[56px] cursor-pointer place-items-center rounded-[10px] font-medium text-text transition-[background,border-color] duration-200",
                method === m
                  ? "border-2 border-brand bg-brand-subtle"
                  : "border border-border bg-surface",
              )}
            >
              {t(`methods.${m}`)}
            </button>
          ))}
        </div>

        {method === "cash" && (
          <div className="grid grid-cols-2 gap-[12px]">
            <label className={LABEL}>
              {t("tendered")}
              <input
                dir="ltr"
                inputMode="decimal"
                value={tendered}
                onChange={(e) => setTendered(cleanAmount(e.target.value))}
                className={FIELD}
              />
            </label>
            <div className={LABEL}>
              {t("change")}
              <span
                dir="ltr"
                data-testid="change"
                className={cn(
                  "flex h-[44px] items-center rounded-[8px] px-[12px] text-[18px] font-semibold",
                  isNegative(change)
                    ? "bg-danger-bg text-danger-text"
                    : "bg-success-bg text-success-text",
                )}
              >
                {cur(change)}
              </span>
            </div>
          </div>
        )}

        {method === "bank" && (
          <div className="grid gap-[12px]">
            {bankFields}
            <div className="flex items-center gap-[10px] rounded-[8px] bg-info-bg px-[12px] py-[10px] font-medium text-info-text">
              {t("pendingVerify")}
            </div>
          </div>
        )}

        {method === "credit" && (
          <div className="grid gap-[12px]">
            <label className={LABEL}>
              {t("custSearch")}
              <input
                value={customer ? pick(ar, customer) : search}
                onChange={(e) => {
                  setCustomer(null);
                  setSearch(e.target.value);
                }}
                className={cn(FIELD, "text-[16px] font-normal")}
              />
            </label>
            {!customer && search.trim() && (
              <div className="grid max-h-[160px] overflow-y-auto rounded-[8px] border border-border">
                {customers.length === 0 && (
                  <div className="p-[12px] text-center text-text-muted">{t("noCustomers")}</div>
                )}
                {customers.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCustomer(c)}
                    className="type-inherit min-h-[44px] cursor-pointer border-0 border-b border-border bg-transparent px-[12px] text-start text-text hover:bg-brand-subtle"
                  >
                    {pick(ar, c)}
                  </button>
                ))}
              </div>
            )}
            {customer && (
              <div className="grid grid-cols-3 gap-[8px]">
                <div className="rounded-[8px] border border-border px-[12px] py-[10px]">
                  <div className="text-[12px] text-text-muted">{t("balance")}</div>
                  <div dir="ltr" className="font-semibold tabular-nums">
                    {cur(customer.balance)}
                  </div>
                </div>
                <div className="rounded-[8px] border border-border px-[12px] py-[10px]">
                  <div className="text-[12px] text-text-muted">{t("limit")}</div>
                  <div dir="ltr" className="font-semibold tabular-nums">
                    {cur(customer.credit_limit ?? "0")}
                  </div>
                </div>
                <div
                  className={cn(
                    "rounded-[8px] px-[12px] py-[10px]",
                    isNegative(creditLeft)
                      ? "bg-danger-bg text-danger-text"
                      : "bg-success-bg text-success-text",
                  )}
                >
                  <div className="text-[12px]">{t("remaining")}</div>
                  <div dir="ltr" className="font-semibold tabular-nums" data-testid="credit-left">
                    {cur(creditLeft)}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {method === "split" && (
          <div className="grid gap-[10px]">
            <div className="grid grid-cols-2 gap-[12px]">
              <label className={LABEL}>
                {t("cashPart")}
                <input
                  dir="ltr"
                  inputMode="decimal"
                  value={cashPart}
                  onChange={(e) => setCashPart(cleanAmount(e.target.value))}
                  className={FIELD}
                />
              </label>
              <div className={LABEL}>
                {t("bankPart")}
                <span
                  dir="ltr"
                  className="flex h-[44px] items-center rounded-[8px] border border-border bg-canvas px-[12px] text-[18px] font-medium text-text"
                >
                  {cur(isNegative(bankPart) ? "0" : bankPart)}
                </span>
              </div>
            </div>
            {bankFields}
            <div className="flex justify-between rounded-[8px] bg-success-bg px-[12px] py-[10px] font-semibold text-success-text">
              <span>{t("remainingPay")}</span>
              <span dir="ltr">{cur("0")}</span>
            </div>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-[8px] bg-danger-bg px-[12px] py-[10px] font-medium text-danger-text"
          >
            {error}
          </div>
        )}

        <div className="flex gap-[8px]">
          <button
            type="submit"
            disabled={busy || !ready}
            aria-busy={busy}
            className={cn(
              "h-[48px] flex-1 rounded-[10px] border-0 text-[16px] font-semibold transition-[background] duration-200",
              busy
                ? "cursor-progress bg-border text-text-muted"
                : ready
                  ? "cursor-pointer bg-brand text-on-brand"
                  : "cursor-not-allowed bg-border text-text-muted",
            )}
          >
            {busy ? t("approving") : t("confirm")}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-[48px] cursor-pointer rounded-[10px] border border-border-strong bg-transparent px-[20px] text-[14px] font-medium text-text"
          >
            {t("cancel")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
