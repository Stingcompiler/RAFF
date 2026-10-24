"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { PageHeader } from "@/components/shell/PageHeader";
import { StaleStamp } from "@/components/ui/StaleStamp";
import { Badge, type Tone } from "@/components/ui/Badge";
import { BarChart } from "@/components/ui/BarChart";
import { Button } from "@/components/ui/Button";
import { ChartCard, type ChartState } from "@/components/ui/ChartCard";
import { Panel } from "@/components/ui/Panel";
import { StatTile } from "@/components/ui/StatTile";
import {
  BadgeCell,
  CodeCell,
  NumberCell,
  TableEmpty,
  TableHead,
  TableRow,
  TextCell,
  type Column,
} from "@/components/ui/Table";
import { apiGet } from "@/lib/api/browser";
import type { Schemas } from "@/lib/api/types";
import { money, timeOfDay } from "@/lib/format";
import { usePhone } from "@/lib/phone";

import { PhoneToday } from "./PhoneToday";

type Overview = Schemas["Overview"];
type ActionKey = keyof Overview["needs_action"];

const ACTIONS: { key: ActionKey; tone: Tone; href?: string }[] = [
  { key: "expiring", tone: "warn", href: "/reports?r=expiry" },
  { key: "below_reorder", tone: "warn", href: "/reports?r=shortages" },
  { key: "receivables", tone: "info", href: "/parties" },
  { key: "unsettled_shifts", tone: "danger", href: "/shifts" },
  { key: "transfers_awaiting", tone: "info", href: "/transfers" },
  { key: "store_orders", tone: "info", href: "/orders" },
  { key: "pending_sync", tone: "success" },
];
const STATUS_TONE = { approved: "success", verifying: "info", to_inspect: "warn" } as const;
const DAYS_AR = ["ح", "ن", "ث", "ر", "خ", "ج", "س"];
const DAYS_EN = ["S", "M", "T", "W", "T", "F", "S"];
const THOUSAND = 1000;

type Props = { initial: Overview; canAll: boolean; branchName: string };

/** Overview on a computer; the owner summary on a phone (Raff Mobile). */
export function DashboardScreen(props: Props) {
  const phone = usePhone();
  return phone ? <PhoneToday {...props} /> : <DashboardDesktop {...props} />;
}

/** Overview (Raff Screens › نظرة عامة). Every figure comes from the server. */
function DashboardDesktop({ initial, canAll }: Props) {
  const t = useTranslations("dashboard");
  const ar = useLocale() === "ar";
  const cur = (v: string) => money(v, ar ? "ar" : "en") || money("0", ar ? "ar" : "en");
  const [data, setData] = useState(initial);
  const [all, setAll] = useState(false);
  const [stamp, setStamp] = useState(() => new Date().toISOString());

  const [chart, setChart] = useState<"ok" | "loading" | "failed">("ok");

  const load = async (scopeAll: boolean) => {
    setChart("loading");
    const res = await apiGet<Overview>(`/dashboard/?scope=${scopeAll ? "all" : "branch"}`);
    if (res.ok) {
      setData(res.data);
      setStamp(new Date().toISOString());
      setChart("ok");
    } else setChart("failed");
  };

  const max = Math.max(1, ...data.week.map((d) => Number(d.total)));
  // The axis is scaled in thousands for display only; every figure shown comes from the server.
  const weekdays = new Intl.DateTimeFormat(ar ? "ar" : "en", { weekday: "long", timeZone: "UTC" });
  const bars = data.week.map((d) => ({
    id: d.date,
    label: (ar ? DAYS_AR : DAYS_EN)[new Date(`${d.date}T12:00:00Z`).getUTCDay()] ?? d.date,
    value: Number(d.total),
    text: cur(d.total),
  }));
  const top = data.week.reduce<(typeof data.week)[number] | null>(
    (a, d) => (a && Number(a.total) >= Number(d.total) ? a : d),
    null,
  );
  const chartState: ChartState =
    chart === "loading"
      ? "loading"
      : chart === "failed"
        ? "failed"
        : data.week.every((d) => Number(d.total) === 0)
          ? "empty"
          : "ready";
  const weekTitle =
    top && chartState === "ready"
      ? t("weekHeadline", {
          day: weekdays.format(new Date(`${top.date}T12:00:00Z`)),
          amount: cur(top.total),
        })
      : t("week");
  const columns: Column[] = [
    { header: t("colTime"), width: "70px" },
    { header: t("colOperation"), width: "minmax(0,1fr)" },
    { header: t("colAmount"), width: "120px", numeric: true },
    { header: t("colStatus"), width: "130px" },
  ];
  const shift = data.open_shift;
  return (
    <>
      <PageHeader
        title={t("title")}
        actions={
          <>
            {canAll && (
              <Button
                variant="outline"
                onClick={() => {
                  setAll(!all);
                  void load(!all);
                }}
              >
                {all ? t("thisBranch") : t("allBranches")}
              </Button>
            )}
            <Button variant="outline" onClick={() => void load(all)}>
              {t("refresh")}
            </Button>
          </>
        }
      />
      <div className="grid grid-cols-12 items-start gap-[16px]">
        <section className="col-span-5 min-w-0 max-[1180px]:col-span-12">
          <Panel title={t("needsAction")} note={<StaleStamp at={stamp} />}>
            <ul className="m-0 list-none p-0">
              {ACTIONS.map(({ key, tone, href }) => {
                const label =
                  key === "expiring"
                    ? t("actions.expiring", { days: data.near_expiry_days })
                    : t(`actions.${key}`);
                const count = data.needs_action[key];
                const row = (
                  <>
                    <span>{label}</span>
                    <Badge tone={count ? tone : "success"} dense>
                      {String(count)}
                    </Badge>
                  </>
                );
                return (
                  <li key={key} className="border-b border-border last:border-b-0">
                    {href ? (
                      <a
                        href={href}
                        className="flex min-h-[44px] items-center justify-between gap-[12px] px-[16px] text-text no-underline hover:bg-surface-subtle"
                      >
                        {row}
                      </a>
                    ) : (
                      <div className="flex min-h-[44px] items-center justify-between gap-[12px] px-[16px]">
                        {row}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Panel>
        </section>
        <section className="col-span-7 grid min-w-0 grid-cols-2 gap-[16px] max-[1180px]:col-span-12">
          <StatTile
            label={t("salesToday")}
            value={cur(data.sales_today)}
            note={t("transactions", { count: data.sales_count })}
          />
          <StatTile
            label={t("cashToday")}
            value={cur(data.cash_today)}
            note={t("bankNote", { amount: cur(data.bank_today) })}
          />
          <StatTile
            label={t("currentShift")}
            value={shift ? t("shiftValue", { number: shift.number }) : t("noShift")}
            note={
              shift
                ? t("shiftNote", {
                    time: timeOfDay(shift.opened_at),
                    user: ar ? shift.user_ar : shift.user_en,
                  })
                : undefined
            }
          />
          <StatTile
            label={t("storeToday")}
            note={
              data.reserved_orders
                ? t("reservedNote", { count: data.reserved_orders })
                : t("storeNote")
            }
            trio={[
              { value: String(data.store_today.new), label: t("new") },
              { value: String(data.store_today.confirmed), label: t("confirmed") },
              { value: String(data.store_today.completed), label: t("completed") },
            ]}
          />
        </section>
        <section className="col-span-6 min-w-0 max-[1180px]:col-span-12">
          <ChartCard
            title={weekTitle}
            note={t("weekNote")}
            state={chartState}
            onRetry={() => void load(all)}
          >
            <BarChart
              ariaLabel={t("week")}
              bars={bars}
              tick={(f) => String(Math.round((max * f) / THOUSAND))}
            />
          </ChartCard>
        </section>
        <section className="col-span-6 min-w-0 max-[1180px]:col-span-12">
          <Panel title={t("latest")}>
            <div role="table" aria-label={t("latest")}>
              <TableHead columns={columns} />
              {data.latest.map((op) => (
                <TableRow key={`${op.kind}-${op.number}`} columns={columns}>
                  <CodeCell>{timeOfDay(op.at)}</CodeCell>
                  <TextCell>{t(op.kind, { number: op.number })}</TextCell>
                  <NumberCell>{cur(op.amount)}</NumberCell>
                  <BadgeCell tone={STATUS_TONE[op.status]}>{t(`status.${op.status}`)}</BadgeCell>
                </TableRow>
              ))}
              {data.latest.length === 0 && <TableEmpty>{t("none")}</TableEmpty>}
            </div>
          </Panel>
        </section>
      </div>
    </>
  );
}
