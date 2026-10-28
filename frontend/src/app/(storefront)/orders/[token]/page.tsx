import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { CheckCircleIcon } from "@/components/ui/icons";
import { OrderAutoRefresh } from "@/features/store/OrderAutoRefresh";
import { OrderPayment } from "@/features/store/OrderPayment";
import { ReceiptUpload } from "@/features/store/ReceiptUpload";
import { type PublicOrder, type Store, waLink } from "@/features/store/types";
import { serverGet } from "@/lib/api/server";
import { cn } from "@/lib/cn";
import { multiply } from "@/lib/decimal";
import { money } from "@/lib/format";

const PICKUP_FLOW = ["new", "confirmed", "preparing", "ready", "completed"] as const;
const DELIVERY_FLOW = [
  "new",
  "confirmed",
  "preparing",
  "ready",
  "out_for_delivery",
  "delivered",
  "completed",
] as const;
const CHECK = "✓";
const TIMES = "×";

/** The customer's view of an order (§4.6), opened only by its long random token. */
export default async function OrderPage({ params, searchParams }: PageProps<"/orders/[token]">) {
  const { token } = await params;
  const receiptFailed = (await searchParams).receipt === "failed";
  const t = await getTranslations("store");
  const ar = (await getLocale()) === "ar";
  const order = await serverGet<PublicOrder>(`/public/orders/${encodeURIComponent(token)}/`);
  if (!order) notFound();
  const store = order.payment_method === "bank" ? await serverGet<Store>("/public/store/") : null;
  const canSend = order.payment_status === "awaiting_proof" || order.payment_status === "rejected";
  const delivery = order.fulfillment === "delivery";
  const flow: readonly string[] = delivery ? DELIVERY_FLOW : PICKUP_FLOW;
  const final = order.status === "completed" || order.status === "cancelled";
  const reached = flow.indexOf(order.status === "delivery_failed" ? "ready" : order.status);
  const side = ["needs_contact", "cancelled", "delivery_failed"].includes(order.status);
  const sideText = [
    t(`status.${order.status}`),
    order.status === "cancelled"
      ? t("statusNote.cancelled")
      : order.status === "needs_contact"
        ? t("statusNote.needs_contact")
        : t("statusNote.delivery_failed"),
  ]
    .filter(Boolean)
    .join(" — ");
  return (
    <section className="mx-auto grid max-w-[720px] gap-[20px] px-[20px] pt-[40px] pb-[56px]">
      <div className="flex items-center gap-[12px] rounded-card bg-success-bg px-[16px] py-[14px] font-semibold text-success-text">
        <CheckCircleIcon size={24} />
        {t("arrived")}
      </div>
      <div>
        <div className="text-body text-text-muted">{t("orderNo")}</div>
        <div
          dir="ltr"
          data-testid="order-number"
          className="text-start text-land-section font-semibold num"
        >
          {order.number}
        </div>
      </div>
      {side && (
        <div
          role="status"
          className={cn(
            "rounded-control px-[14px] py-[12px] font-medium",
            order.status === "cancelled" || order.status === "delivery_failed"
              ? "bg-danger-bg text-danger-text"
              : "bg-warning-bg text-warning-text",
          )}
        >
          {sideText}
        </div>
      )}
      <div className="flex flex-wrap gap-x-[16px] gap-y-[4px] text-body text-text-secondary">
        <span>{t(`fulfillment.${order.fulfillment}`)}</span>
        <span>{t(`paymentMethod.${order.payment_method}`)}</span>
      </div>
      {order.payment_method === "bank" && (
        <div
          role="status"
          data-testid="payment-status"
          className="rounded-control border border-border bg-surface px-[14px] py-[12px] font-medium"
        >
          {t(`payState.${order.payment_status}`)}
        </div>
      )}
      {order.payment_method === "bank" && canSend && order.status !== "cancelled" && (
        <OrderPayment
          token={token}
          accounts={store?.bank_accounts ?? ""}
          estimate={order.estimated_total}
          rejectedNote={order.payment_status === "rejected" ? order.payment_note : ""}
        />
      )}
      {order.payment_method === "bank" && receiptFailed && (
        <div
          role="status"
          className="rounded-control bg-warning-bg px-[14px] py-[10px] font-medium text-warning-text"
        >
          {t("receiptLate")}
        </div>
      )}
      {order.payment_method === "bank" &&
        order.status !== "cancelled" &&
        ["awaiting_proof", "submitted", "rejected"].includes(order.payment_status) && (
          <ReceiptUpload token={token} has={order.has_receipt} />
        )}
      <ol
        aria-label={t("orderNo")}
        className="ms-[11px] grid list-none border-s-2 border-border p-0"
      >
        {flow.map((step, i) => {
          const done = reached >= 0 ? i <= reached : i === 0;
          const note =
            step === "new"
              ? t("statusNote.new")
              : step === "confirmed"
                ? t("statusNote.confirmed")
                : "";
          return (
            <li
              key={step}
              aria-current={i === reached ? "step" : undefined}
              className="-ms-[13px] flex items-start gap-[14px] pb-[16px]"
            >
              <span
                className={cn(
                  "grid size-[24px] flex-none place-items-center rounded-full text-label font-bold",
                  done ? "bg-brand text-on-brand" : "border-2 border-border-strong bg-surface",
                )}
              >
                {done ? CHECK : ""}
              </span>
              <div>
                <div
                  className={cn(done ? "font-semibold text-text" : "font-medium text-text-muted")}
                >
                  {step === "ready" && delivery ? t("status.ready_delivery") : t(`status.${step}`)}
                </div>
                {note && <div className="text-label text-text-muted">{note}</div>}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="rounded-card border border-border bg-surface p-[16px] leading-loose">
        {t("orderInfo")}
      </div>
      <div className="rounded-card border border-border bg-surface px-[16px] py-[6px]">
        {order.lines.map((l, i) => (
          <div key={i} className="flex min-h-[44px] items-center justify-between gap-[12px]">
            <span>
              {[ar ? l.name_ar : l.name_en, l.strength].filter(Boolean).join(" ")}{" "}
              <span dir="ltr" className="text-text-muted num">
                {[TIMES, l.quantity].join(" ")}
              </span>
            </span>
            <span className="num" dir="ltr">
              {l.price
                ? money(multiply(l.price, l.quantity), ar ? "ar" : "en")
                : t("pharmacistReview")}
            </span>
          </div>
        ))}
        <div className="flex min-h-[48px] items-center justify-between border-t border-border font-semibold">
          <span>{t("est")}</span>
          <span className="num" dir="ltr">
            {money(order.estimated_total, ar ? "ar" : "en")}
          </span>
        </div>
      </div>
      <OrderAutoRefresh active={!final} />
      {order.whatsapp && (
        <a
          href={waLink(order.whatsapp, order.number)}
          className="inline-flex min-h-[48px] items-center justify-center rounded-card bg-brand font-semibold text-on-brand no-underline"
        >
          {t("openWa")}
        </a>
      )}
      <Link
        href="/orders/track"
        className="inline-flex min-h-[44px] items-center justify-center font-medium text-brand underline underline-offset-4"
      >
        {t("trackAnother")}
      </Link>
    </section>
  );
}
