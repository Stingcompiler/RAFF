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
            order.status === "cancelled"
              ? "bg-danger-bg text-danger-text"
              : "bg-warning-bg text-warning-text",
          )}
        >
          {sideText}
        </div>
      )}
      <ol
        aria-label={t("orderNo")}
        className="ms-[11px] grid list-none border-s-2 border-border p-0"
      >
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
                  {t(`status.${step}`)}
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
      {order.whatsapp && (
        <a
          href={waLink(order.whatsapp, order.number)}
          className="inline-flex min-h-[52px] items-center justify-center rounded-card bg-brand font-semibold text-on-brand no-underline"
        >
          {t("openWa")}
        </a>
      )}
    </section>
  );
}
