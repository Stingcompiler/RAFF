"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { PageHeader } from "@/components/shell/PageHeader";
import { StaleNote } from "@/components/ui/StaleNote";

import { Badge } from "@/components/ui/Badge";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Panel";
import { SearchIcon } from "@/components/ui/icons";
import { apiGet, apiSend } from "@/lib/api/browser";
import { whatsappNumber } from "@/lib/whatsapp";

import { INQUIRY_STATUSES, INQUIRY_TONE, type InquiryRow, type InquiryStatus } from "./labels";

/** What visitors asked on the shop's contact page, newest first, with a one-tap reply. */
export function InquiriesScreen({ initial }: { initial: InquiryRow[] }) {
  const t = useTranslations("orders.inq");
  const [rows, setRows] = useState(initial);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<InquiryStatus | "">("");
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let live = true;
    const timer = setTimeout(async () => {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (status) params.set("status", status);
      const res = await apiGet<InquiryRow[]>(`/inquiries/?${params}`);
      if (!live) return;
      setStale(!res.ok);
      if (res.ok) setRows(res.data);
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q, status]);

  const mark = async (row: InquiryRow, next: InquiryStatus) => {
    const res = await apiSend<InquiryRow>("POST", `/inquiries/${row.id}/status/`, { status: next });
    if (res.ok) setRows((all) => all.map((r) => (r.id === row.id ? res.data : r)));
  };

  return (
    <>
      <PageHeader
        title={t("title")}
        actions={
          <Link href="/orders" className={buttonClasses({ variant: "outline" })}>
            {t("back")}
          </Link>
        }
      />
      <div className="flex flex-wrap items-center gap-[8px]">
        <label className="flex h-[40px] min-w-[200px] flex-1 items-center gap-[8px] rounded-control border border-border-strong bg-surface px-[12px] sm:max-w-[360px]">
          <SearchIcon className="text-text-muted" />
          <input
            type="search"
            aria-label={t("search")}
            placeholder={t("search")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="min-w-0 flex-1 border-0 bg-transparent text-body text-text outline-none"
          />
        </label>
        <button type="button" onClick={() => setStatus("")} className="contents cursor-pointer">
          <Chip active={!status}>{t("all")}</Chip>
        </button>
        {INQUIRY_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className="contents cursor-pointer"
          >
            <Chip active={status === s}>{t(s)}</Chip>
          </button>
        ))}
      </div>
      <StaleNote show={stale} />
      <div className="text-label text-text-muted">{t("count", { count: rows.length })}</div>
      {rows.length === 0 && (
        <div className="rounded-card border border-border bg-surface p-[24px] text-center text-text-muted">
          {t("empty")}
        </div>
      )}
      <div className="grid gap-[12px] [grid-template-columns:repeat(auto-fill,minmax(min(360px,100%),1fr))]">
        {rows.map((row) => (
          <article
            key={row.id}
            className={`grid content-start gap-[10px] rounded-card border bg-surface p-[14px] ${
              row.unread ? "border-brand" : "border-border"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-[8px]">
              <span className="flex items-center gap-[8px]">
                <bdi dir="ltr" className="font-semibold num">
                  {row.number}
                </bdi>
                <Badge tone={INQUIRY_TONE[row.status]}>{t(row.status)}</Badge>
              </span>
              <span className="text-caption text-text-muted">
                <bdi dir="ltr" className="num">
                  {row.created_at.slice(0, 16).replace("T", " ")}
                </bdi>
              </span>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-[8px]">
              <span className="font-semibold">{row.customer_name}</span>
              <bdi dir="ltr" className="num">
                {row.phone}
              </bdi>
            </div>
            <div className="flex flex-wrap gap-x-[12px] gap-y-[2px] text-label text-text-muted">
              <span>{t(`topic.${row.topic}`)}</span>
              {row.order_number && (
                <span>
                  {t("order")} <bdi className="num">{row.order_number}</bdi>
                </span>
              )}
              <span>
                {t("via")} {t(`viaName.${row.contact_via}`)}
              </span>
              <span className="uppercase">{row.locale}</span>
            </div>
            <p className="m-0 whitespace-pre-wrap">{row.message}</p>
            <div className="flex flex-wrap gap-[8px]">
              <a
                href={`https://wa.me/${whatsappNumber(row.phone)}?text=${encodeURIComponent(
                  t("waReply", { name: row.customer_name, number: row.number }),
                )}`}
                target="_blank"
                rel="noreferrer"
                className={buttonClasses({ variant: "primary" })}
              >
                {t("wa")}
              </a>
              <a href={`tel:${row.phone}`} className={buttonClasses({ variant: "outline" })}>
                {t("call")}
              </a>
              {row.status === "new" && (
                <Button variant="outline" onClick={() => mark(row, "answered")}>
                  {t("markAnswered")}
                </Button>
              )}
              {row.status !== "closed" && (
                <Button variant="quiet" onClick={() => mark(row, "closed")}>
                  {t("markClosed")}
                </Button>
              )}
              {row.status === "closed" && (
                <Button variant="quiet" onClick={() => mark(row, "new")}>
                  {t("reopen")}
                </Button>
              )}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
