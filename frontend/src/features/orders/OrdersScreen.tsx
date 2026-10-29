"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { PageHeader } from "@/components/shell/PageHeader";
import { StaleNote } from "@/components/ui/StaleNote";

import { Chip, Panel } from "@/components/ui/Panel";
import { SearchIcon } from "@/components/ui/icons";
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
import { cn } from "@/lib/cn";
import { amount, timeOfDay } from "@/lib/format";
import { usePhone } from "@/lib/phone";

import { InquiriesLink } from "./InquiriesLink";
import { type OrderRow, type OrderStatus, STATUS_TONE, STATUSES } from "./labels";
import { PhoneOrders } from "./PhoneOrders";

type Period = "today" | "week" | "all";
const PERIODS: Period[] = ["today", "week", "all"];
const DASH = "—";

/** Storefront orders: a table on a computer, order cards on a phone (Raff Mobile). */
export function OrdersScreen({ initial }: { initial: OrderRow[] }) {
  const phone = usePhone();
  return phone ? <PhoneOrders initial={initial} /> : <OrdersDesktop initial={initial} />;
}

/** Storefront orders (STOREFRONT-DESIGN-CHANGES §5.1). */
function OrdersDesktop({ initial }: { initial: OrderRow[] }) {
  const t = useTranslations("orders");
  const ar = useLocale() === "ar";
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<OrderStatus | "">("");
  const [period, setPeriod] = useState<Period>("all");
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let live = true;
    const timer = setTimeout(async () => {
      const params = new URLSearchParams({ period });
      if (q.trim()) params.set("q", q.trim());
      if (status) params.set("status", status);
      const res = await apiGet<OrderRow[]>(`/orders/?${params}`);
      if (!live) return;
      setStale(!res.ok);
      if (res.ok) setRows(res.data);
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q, status, period]);

  const columns: Column[] = [
    { header: t("hNo"), width: "84px" },
    { header: t("hTime"), width: "112px" },
    { header: t("hCust"), width: "minmax(0,1fr)" },
    { header: t("hPhone"), width: "112px" },
    { header: t("hTotal"), width: "128px", numeric: true },
    { header: t("hStatus"), width: "170px" },
    { header: t("hOwner"), width: "90px" },
  ];
  return (
    <>
      <PageHeader title={t("title")} actions={<InquiriesLink />} />
      <StaleNote show={stale} />
      <Panel
        title={t("count", { count: rows.length })}
        chips={
          <>
            <button type="button" onClick={() => setStatus("")} className="contents cursor-pointer">
              <Chip active={!status}>{t("allStatuses")}</Chip>
            </button>
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className="contents cursor-pointer"
              >
                <Chip active={status === s}>{t(`status.${s}`)}</Chip>
              </button>
            ))}
            <span className="ms-auto flex gap-[2px] rounded-control bg-surface-subtle p-[3px]">
              {PERIODS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={cn(
                    "type-inherit cursor-pointer rounded-control border-0 px-[10px] py-[4px] text-label",
                    period === p
                      ? "bg-surface font-medium text-brand"
                      : "bg-transparent text-text-muted",
                  )}
                >
                  {t(p)}
                </button>
              ))}
            </span>
            <label className="flex items-center gap-[6px] rounded-full border border-border px-[12px] py-[2px] text-label text-text-muted focus-within:border-brand">
              <SearchIcon size={14} />
              <input
                type="search"
                aria-label={t("search")}
                placeholder={t("search")}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-[160px] border-0 bg-transparent p-0 text-label text-text outline-none"
              />
            </label>
          </>
        }
      >
        <div role="table" aria-label={t("title")}>
          <TableHead columns={columns} />
          {rows.map((o) => (
            <TableRow
              key={o.id}
              columns={columns}
              selected={o.unread}
              onActivate={() => router.push(`/orders/detail/${o.id}`)}
            >
              <CodeCell>{o.number}</CodeCell>
              <CodeCell>{[o.created_at.slice(5, 10), timeOfDay(o.created_at)].join(" ")}</CodeCell>
              <TextCell>{o.customer_name}</TextCell>
              <CodeCell>{o.phone}</CodeCell>
              <NumberCell>{amount(o.estimated_total) || "0"}</NumberCell>
              <BadgeCell tone={STATUS_TONE[o.status]}>{t(`status.${o.status}`)}</BadgeCell>
              <TextCell>{(ar ? o.assigned_ar : o.assigned_en) ?? DASH}</TextCell>
            </TableRow>
          ))}
          {rows.length === 0 && <TableEmpty>{t("none")}</TableEmpty>}
        </div>
      </Panel>
    </>
  );
}
