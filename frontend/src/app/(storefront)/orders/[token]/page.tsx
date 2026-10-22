import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { CheckCircleIcon } from "@/components/ui/icons";
import { type PublicOrder, waLink } from "@/features/store/types";
import { serverGet } from "@/lib/api/server";
import { cn } from "@/lib/cn";
import { multiply } from "@/lib/decimal";
import { money } from "@/lib/format";

const FLOW = ["new", "confirmed", "preparing", "ready", "completed"] as const;
const CHECK = "✓";
const TIMES = "×";

/** The customer's view of an order (§4.6), opened only by its long random token. */
export default async function OrderPage({ params }: PageProps<"/orders/[token]">) {
  const { token } = await params;
  const t = await getTranslations("store");
  const ar = (await getLocale()) === "ar";
  const order = await serverGet<PublicOrder>(`/public/orders/${encodeURIComponent(token)}/`);
  if (!order) notFound();
  const reached = FLOW.indexOf(order.status as (typeof FLOW)[number]);
  const side = order.status === "needs_contact" || order.status === "cancelled";
  const sideText = [
    t(`status.${order.status}`),
    order.status === "cancelled" ? t("statusNote.cancelled") : t("statusNote.needs_contact"),
  ].join(" — ");
  return (
    <section className="grid max-w-[720px] gap-[20px] px-[20px] pt-[32px] pb-[48px]">
      <div className="flex items-center gap-[12px] rounded-[12px] bg-success-bg px-[16px] py-[14px] font-semibold text-success">
        <CheckCircleIcon size={24} />
        {t("arrived")}
      </div>
      <div>
        <div className="text-[14px] text-muted">{t("orderNo")}</div>
        <div
          dir="ltr"
          data-testid="order-number"
          className="text-start text-[34px] font-semibold tabular-nums"
        >
          {order.number}
        </div>
      </div>
      {side && (
        <div
          role="status"
          className={cn(
            "rounded-[10px] px-[14px] py-[12px] font-medium",
            order.status === "cancelled" ? "bg-danger-bg text-danger" : "bg-warn-bg text-warn",
          )}
        >
          {sideText}
        </div>
      )}
      <ol aria-label={t("orderNo")} className="ms-[11px] grid list-none border-s-2 border-line p-0">
        {FLOW.map((step, i) => {
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
                  "grid size-[24px] flex-none place-items-center rounded-full text-[13px] font-bold",
                  done ? "bg-brand text-brand-ink" : "border-2 border-line-strong bg-surface",
                )}
              >
                {done ? CHECK : ""}
              </span>
              <div>
                <div className={cn(done ? "font-semibold text-ink" : "font-medium text-muted")}>
                  {t(`status.${step}`)}
                </div>
                {note && <div className="text-[13px] text-muted">{note}</div>}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="rounded-[12px] border border-line bg-surface p-[16px] leading-[1.7]">
        {t("orderInfo")}
      </div>
      <div className="rounded-[12px] border border-line bg-surface px-[16px] py-[6px]">
        {order.lines.map((l, i) => (
          <div key={i} className="flex min-h-[44px] items-center justify-between gap-[12px]">
            <span>
              {[ar ? l.name_ar : l.name_en, l.strength].filter(Boolean).join(" ")}{" "}
              <span dir="ltr" className="text-muted">
                {[TIMES, l.quantity].join(" ")}
              </span>
            </span>
            <span dir="ltr">
              {l.price
                ? money(multiply(l.price, l.quantity), ar ? "ar" : "en")
                : t("pharmacistReview")}
            </span>
          </div>
        ))}
        <div className="flex min-h-[48px] items-center justify-between border-t border-line font-semibold">
          <span>{t("est")}</span>
          <span dir="ltr">{money(order.estimated_total, ar ? "ar" : "en")}</span>
        </div>
      </div>
      {order.whatsapp && (
        <a
          href={waLink(order.whatsapp, order.number)}
          className="inline-flex min-h-[52px] items-center justify-center rounded-[12px] bg-brand font-semibold text-brand-ink no-underline"
        >
          {t("openWa")}
        </a>
      )}
    </section>
  );
}
