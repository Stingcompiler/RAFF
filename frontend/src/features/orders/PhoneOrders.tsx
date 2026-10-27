"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { TONE_CLASSES, TONE_SYMBOL } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { apiSend } from "@/lib/api/browser";
import { cn } from "@/lib/cn";
import { money, timeOfDay } from "@/lib/format";
import { waLink } from "@/lib/whatsapp";

import { InquiriesLink } from "./InquiriesLink";
import { type OrderRow, type OrderStatus, STATUS_TONE } from "./labels";

/** The next step a phone can take without a reason (cancel and contact stay on the computer). */
const NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  new: "confirmed",
  needs_contact: "confirmed",
  confirmed: "preparing",
  preparing: "ready",
};
const ARROW_AR = "←";
const ARROW_EN = "→";

/** Raff Mobile › 5 · طلبات المتجر (موظف): one card per order with the next step one tap away. */
export function PhoneOrders({ initial }: { initial: OrderRow[] }) {
  const t = useTranslations("phone.orders");
  const tOrders = useTranslations("orders");
  const ar = useLocale() === "ar";
  const toast = useToast();
  const cur = (v: string) => money(v, ar ? "ar" : "en") || money("0", ar ? "ar" : "en");
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  const fresh = rows.filter((o) => o.status === "new").length;

  const advance = async (order: OrderRow, to: OrderStatus) => {
    setBusy(order.id);
    const res = await apiSend<{ status: OrderStatus }>("POST", `/orders/${order.id}/transition/`, {
      to,
      reason: "",
    });
    setBusy(null);
    if (!res.ok) return toast.push("danger", t("failed"));
    const status = res.data.status;
    setRows((prev) => prev.map((o) => (o.id === order.id ? { ...o, status } : o)));
  };

  return (
    <>
      <div className="flex items-baseline justify-between px-[16px] pt-[8px] pb-[12px]">
        <h1 className="m-0 type-page">{t("title")}</h1>
        <InquiriesLink />
        {fresh > 0 && (
          <span
            className={cn(
              "rounded-pill border px-[7px] py-[1px] text-caption font-medium",
              TONE_CLASSES.info,
            )}
          >
            {t("newCount", { count: fresh })}
          </span>
        )}
      </div>
      <div className="grid flex-1 content-start gap-[10px] overflow-auto px-[16px] pb-[16px]">
        {rows.map((order) => {
          const tone = STATUS_TONE[order.status];
          const next = NEXT[order.status];
          return (
            <article
              key={order.id}
              className={cn(
                "grid gap-[10px] rounded-card border bg-surface px-[14px] py-[12px]",
                order.status === "new" ? "border-brand" : "border-border",
              )}
            >
              <div className="flex items-center justify-between gap-[8px]">
                <b dir="ltr" className="whitespace-nowrap num">
                  {order.number}
                </b>
                <span
                  className={cn(
                    "rounded-pill border px-[7px] py-[1px] text-caption font-medium whitespace-nowrap",
                    TONE_CLASSES[tone],
                  )}
                >
                  {TONE_SYMBOL[tone]} {t(`status.${order.status}`)}
                </span>
              </div>
              {order.payment_method === "bank" && (
                <div className="flex flex-wrap gap-x-[10px] text-label font-medium text-info-text">
                  <span>{tOrders("paymentMethod.bank")}</span>
                  <span>{tOrders(`payState.${order.payment_status}`)}</span>
                </div>
              )}
              {order.address && (
                <div className="truncate text-label text-text-muted">{order.address}</div>
              )}
              <div className="flex justify-between gap-[8px] text-label text-text-muted">
                <span className="flex min-w-0 gap-[6px]">
                  <span className="min-w-0 truncate">{order.customer_name}</span>
                  <bdi dir="ltr" className="flex-none num">
                    {timeOfDay(order.created_at)}
                  </bdi>
                </span>
                <span dir="ltr" className="flex-none font-semibold whitespace-nowrap text-text num">
                  {cur(order.estimated_total)}
                </span>
              </div>
              <div className="flex gap-[8px]">
                <a
                  href={waLink(order.phone)}
                  aria-label={t("waFor", { name: order.customer_name })}
                  className="flex min-h-[44px] flex-1 items-center justify-center rounded-control border border-border-strong font-medium whitespace-nowrap text-text no-underline"
                >
                  {t("whatsapp")}
                </a>
                {next ? (
                  <button
                    type="button"
                    disabled={busy === order.id}
                    onClick={() => void advance(order, next)}
                    className="min-h-[44px] flex-1 cursor-pointer rounded-control border-0 bg-brand font-[inherit] font-semibold whitespace-nowrap text-on-brand transition-[background] duration-(--motion-feedback) disabled:opacity-60"
                  >
                    {[ar ? ARROW_AR : ARROW_EN, t(`status.${next}`)].join(" ")}
                  </button>
                ) : (
                  <span className="grid min-h-[44px] flex-1 place-items-center rounded-control bg-border px-[8px] text-center font-semibold text-text-muted">
                    {order.status === "ready" ? t("viaPos") : t(`status.${order.status}`)}
                  </span>
                )}
              </div>
            </article>
          );
        })}
        {rows.length === 0 && (
          <div className="px-[8px] py-[24px] text-center text-text-muted">{t("noOrders")}</div>
        )}
      </div>
    </>
  );
}
