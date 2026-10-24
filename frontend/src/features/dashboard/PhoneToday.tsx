"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { TONE_CLASSES, type Tone } from "@/components/ui/Badge";
import { apiGet } from "@/lib/api/browser";
import type { Schemas } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";

type Overview = Schemas["Overview"];
type ActionKey = keyof Overview["needs_action"];

/** Raff Mobile › 3 · ملخص المالك: three rows from the design, plus the store orders entry. */
const ACTIONS: { key: ActionKey; tone: Tone; href?: string }[] = [
  { key: "expiring", tone: "warn" },
  { key: "unsettled_shifts", tone: "danger" },
  { key: "transfers_awaiting", tone: "info" },
  { key: "store_orders", tone: "info", href: "/orders" },
];
const TICK_MS = 30_000;
const BAR_MIN = 4;

type Props = { initial: Overview; canAll: boolean; branchName: string };

export function PhoneToday({ initial, canAll, branchName }: Props) {
  const t = useTranslations("phone.today");
  const tDash = useTranslations("dashboard");
  const ar = useLocale() === "ar";
  const cur = (v: string) => money(v, ar ? "ar" : "en") || money("0", ar ? "ar" : "en");
  const [data, setData] = useState(initial);
  const [all, setAll] = useState(false);
  const [stamp, setStamp] = useState(() => Date.now());
  const [now, setNow] = useState(stamp);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const grow = setTimeout(() => setReady(true), 120);
    const tick = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => {
      clearTimeout(grow);
      clearInterval(tick);
    };
  }, []);

  const load = async (scopeAll: boolean) => {
    setAll(scopeAll);
    const res = await apiGet<Overview>(`/dashboard/?scope=${scopeAll ? "all" : "branch"}`);
    if (res.ok) {
      setData(res.data);
      setStamp(Date.now());
      setNow(Date.now());
    }
  };

  const max = Math.max(1, ...data.week.map((d) => Number(d.total)));
  const minutes = Math.max(0, Math.floor((now - stamp) / 60_000));
  const seg = (on: boolean) =>
    cn(
      "min-h-[44px] cursor-pointer rounded-control border-0 p-[10px] text-center font-[inherit] text-body font-medium",
      "transition-[background,color] duration-(--motion-feedback)",
      on ? "bg-surface text-brand shadow-segment" : "bg-transparent text-text-muted",
    );

  return (
    <>
      <div className="grid gap-[12px] px-[16px] pt-[8px] pb-[12px]">
        <h1 className="m-0 type-page">{t("title")}</h1>
        {canAll && (
          <div
            role="radiogroup"
            aria-label={t("scopeLabel")}
            className="grid grid-cols-2 gap-[4px] rounded-control bg-surface-subtle p-[4px]"
          >
            <button
              type="button"
              role="radio"
              aria-checked={all}
              onClick={() => void load(true)}
              className={seg(all)}
            >
              {t("all")}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={!all}
              onClick={() => void load(false)}
              className={seg(!all)}
            >
              {branchName}
            </button>
          </div>
        )}
      </div>
      <div className="grid flex-1 content-start gap-[12px] px-[16px] pb-[16px]">
        <section className="grid gap-[4px] rounded-card border border-border bg-surface p-[16px]">
          <span className="text-label text-text-muted">{t("sales")}</span>
          <span
            dir="ltr"
            className="text-start text-metric font-medium transition-opacity duration-(--motion-feedback) num"
          >
            {cur(data.sales_today)}
          </span>
          <span className="text-caption text-text-muted">{t("updated", { minutes })}</span>
          <div
            dir="ltr"
            role="img"
            aria-label={t("week")}
            className="mt-[8px] flex h-[80px] items-end gap-[6px] num"
          >
            {data.week.map((d, i) => (
              <span
                key={d.date}
                title={cur(d.total)}
                className={cn(
                  "flex-1 rounded-t-[4px] bg-chart-1 transition-[height] duration-(--motion-panel-in) ease-[cubic-bezier(.2,.8,.2,1)]",
                  i === data.week.length - 1 ? "opacity-100" : "opacity-50",
                )}
                style={{
                  height: ready
                    ? `${Math.max(BAR_MIN, Math.round((Number(d.total) / max) * 100))}%`
                    : "0%",
                  transitionDelay: `${i * 60}ms`,
                }}
              />
            ))}
          </div>
        </section>
        <ul className="m-0 list-none overflow-hidden rounded-card border border-border bg-surface p-0">
          {ACTIONS.map(({ key, tone, href }) => {
            const count = data.needs_action[key];
            const label =
              key === "expiring"
                ? tDash("actions.expiring", { days: data.near_expiry_days })
                : tDash(`actions.${key}`);
            const row = (
              <>
                <span className="flex-1">{label}</span>
                <span
                  className={cn(
                    "rounded-pill border px-[7px] py-[1px] text-caption font-medium whitespace-nowrap",
                    TONE_CLASSES[count ? tone : "success"],
                  )}
                >
                  {String(count)}
                </span>
              </>
            );
            const cls =
              "flex min-h-[48px] items-center gap-[12px] border-b border-border px-[16px] py-[8px]";
            return (
              <li key={key}>
                {href ? (
                  <Link href={href} className={cn(cls, "text-text no-underline")}>
                    {row}
                  </Link>
                ) : (
                  <div className={cls}>{row}</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
