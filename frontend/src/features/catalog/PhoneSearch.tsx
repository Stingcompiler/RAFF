"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { SearchIcon } from "@/components/ui/icons";
import { apiGet } from "@/lib/api/browser";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";

import { type BatchRow, inSaleUnit, pick, STOCK_TONE, type StockRow, strengthForm } from "./labels";

type Page = { count: number; next: string | null; results: StockRow[] };
const DASH = "—";
const COLON = ":";
const PAGE = 30;

/** Quick item lookup (Raff Mobile › 1 · بحث سريع عن صنف): one card per item, batch detail on tap. */
export function PhoneSearch({ initial }: { initial: Page }) {
  const t = useTranslations("phone.search");
  const tInv = useTranslations("inventory");
  const ar = useLocale() === "ar";
  const cur = (v: string) => money(v, ar ? "ar" : "en") || DASH;
  const [page, setPage] = useState<Page>(initial);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [batch, setBatch] = useState<BatchRow | null>(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    let live = true;
    const timer = setTimeout(async () => {
      const params = new URLSearchParams({ limit: String(PAGE), active: "all" });
      if (query.trim()) params.set("q", query.trim());
      const res = await apiGet<Page>(`/inventory/items/?${params}`);
      if (live && res.ok) {
        setPage(res.data);
        // A refresh must not fold the card the user just opened.
        setOpen((current) => (res.data.results.some((i) => i.id === current) ? current : null));
      }
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    if (!open) return;
    let live = true;
    void apiGet<BatchRow[]>(`/inventory/items/${open}/batches/`).then((res) => {
      if (live) setBatch(res.ok ? (res.data.find((b) => b.quantity_base > 0) ?? null) : null);
    });
    return () => {
      live = false;
    };
  }, [open]);

  const more = async () => {
    const params = new URLSearchParams({
      limit: String(PAGE),
      offset: String(page.results.length),
      active: "all",
    });
    if (query.trim()) params.set("q", query.trim());
    const res = await apiGet<Page>(`/inventory/items/?${params}`);
    if (res.ok)
      setPage((prev) => ({ ...res.data, results: [...prev.results, ...res.data.results] }));
  };

  return (
    <>
      <h1 className="m-0 px-[16px] pt-[8px] pb-[12px] type-page">{t("title")}</h1>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[auto_1fr] gap-[12px] px-[16px]">
        <label className="flex h-[48px] items-center gap-[8px] rounded-card border-2 border-brand bg-surface px-[14px]">
          <SearchIcon size={20} className="flex-none text-text-muted" />
          <input
            type="search"
            dir="auto"
            aria-label={t("ph")}
            placeholder={t("ph")}
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-w-0 flex-1 border-0 bg-transparent text-lead text-text outline-none"
          />
        </label>
        <div className="grid content-start gap-[8px] overflow-y-auto pb-[16px]">
          {page.results.map((item) => {
            const expanded = open === item.id;
            const status = item.is_active ? item.stock.status : null;
            return (
              <button
                key={item.id}
                type="button"
                aria-expanded={expanded}
                onClick={() => {
                  setBatch(null);
                  setOpen(expanded ? null : item.id);
                }}
                className={cn(
                  "grid w-full cursor-pointer gap-[4px] rounded-card border bg-surface px-[14px] py-[12px] text-start font-[inherit] text-body text-text",
                  "transition-[border-color,transform] duration-(--motion-feedback)",
                  expanded ? "border-brand" : "border-border",
                )}
              >
                <span className="flex items-baseline justify-between gap-[8px]">
                  <span className="min-w-0 truncate font-medium">
                    {[pick(ar, item), item.strength].filter(Boolean).join(" ")}
                  </span>
                  <span dir="ltr" className="flex-none font-semibold whitespace-nowrap num">
                    {item.price ? cur(item.price) : DASH}
                  </span>
                </span>
                <span className="flex items-center gap-[8px] text-label whitespace-nowrap text-text-muted">
                  <span>
                    {t("stock")}{" "}
                    <b dir="ltr" className="text-text num">
                      {inSaleUnit(item.stock.sellable_base, item.sale_unit?.factor)}
                    </b>
                  </span>
                  {status ? (
                    <Badge tone={STOCK_TONE[status]} dense>
                      {tInv(`status.${status}`)}
                    </Badge>
                  ) : (
                    <Badge tone="danger" dense>
                      {tInv("inactive")}
                    </Badge>
                  )}
                </span>
                <span
                  className={cn(
                    "grid transition-[grid-template-rows,opacity] duration-(--motion-panel-in)",
                    expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                  )}
                >
                  <span className="grid gap-[4px] overflow-hidden pt-[8px] text-label text-text-muted">
                    <span>
                      {t("batch")}
                      {COLON}{" "}
                      <b dir="ltr" className="text-text num">
                        {expanded ? (batch?.batch_no ?? DASH) : DASH}
                      </b>
                    </span>
                    <span>
                      {t("exp")}
                      {COLON}{" "}
                      <b dir="ltr" className="text-text num">
                        {expanded
                          ? (batch?.expiry_date ?? item.stock.nearest_expiry ?? DASH)
                          : DASH}
                      </b>
                    </span>
                    <span>
                      {t("form")}
                      {COLON}{" "}
                      <b dir="ltr" className="text-text num">
                        {strengthForm(item) || DASH}
                      </b>
                    </span>
                  </span>
                </span>
              </button>
            );
          })}
          {page.results.length === 0 && (
            <div className="px-[8px] py-[24px] text-center text-text-muted">{t("none")}</div>
          )}
          {page.next && (
            <button
              type="button"
              onClick={() => void more()}
              className="min-h-[44px] cursor-pointer rounded-control border border-border-strong bg-transparent font-[inherit] text-body text-text"
            >
              {tInv("more")}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
