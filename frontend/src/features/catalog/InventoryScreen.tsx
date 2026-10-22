"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import { PageHeader } from "@/components/shell/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonClasses } from "@/components/ui/Button";
import { SearchIcon } from "@/components/ui/icons";
import { Chip, Panel } from "@/components/ui/Panel";
import {
  CodeCell,
  NumberCell,
  TableEmpty,
  TableHead,
  TableRow,
  TextCell,
  type Column,
} from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { apiDownload, apiGet } from "@/lib/api/browser";
import type { Schemas } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { amount } from "@/lib/format";

import { ItemDrawer } from "./ItemDrawer";
import { ItemFormDialog } from "./ItemFormDialog";
import { type ItemDetail, type ItemRow, itemLabel, pick, strengthForm } from "./labels";
import { PriceDialog } from "./PriceDialog";

type Page = { count: number; next: string | null; results: ItemRow[] };
const DASH = "—";
const PAGE = 50;

type Props = { initial: Page; categories: Schemas["Category"][]; canManage: boolean };

/** Items & stock (Raff Screens › الأصناف والمخزون). Stock columns fill in with WO-04. */
export function InventoryScreen({ initial, categories, canManage }: Props) {
  const t = useTranslations("inventory");
  const ar = useLocale() === "ar";
  const toast = useToast();
  const [page, setPage] = useState<Page>(initial);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [selected, setSelected] = useState<ItemRow | null>(null);
  const [drawer, setDrawer] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [form, setForm] = useState<{ open: boolean; item: ItemDetail | null }>({
    open: false,
    item: null,
  });
  const [priceFor, setPriceFor] = useState<ItemDetail | null>(null);

  const load = useCallback(
    async (offset = 0) => {
      const params = new URLSearchParams({
        limit: String(PAGE),
        offset: String(offset),
        active: "all",
      });
      if (query) params.set("q", query);
      if (category) params.set("category", category);
      const res = await apiGet<Page>(`/catalog/items/?${params}`);
      if (res.ok) {
        setPage((prev) =>
          offset ? { ...res.data, results: [...prev.results, ...res.data.results] } : res.data,
        );
      }
    },
    [query, category],
  );

  useEffect(() => {
    const timer = setTimeout(() => void load(0), 200);
    return () => clearTimeout(timer);
  }, [load]);

  const saved = (item: ItemDetail) => {
    setForm({ open: false, item: null });
    setPriceFor(null);
    setVersion((v) => v + 1);
    toast.push("success", t("saved"));
    void load(0);
    setDrawer(item.id);
  };

  const columns: Column[] = [
    { header: t("colItem"), width: "minmax(0,1.6fr)" },
    { header: t("colForm"), width: "110px" },
    { header: t("colStock"), width: "70px", numeric: true },
    { header: t("colExpiry"), width: "100px" },
    { header: t("colCost"), width: "90px", numeric: true },
    { header: t("colPrice"), width: "90px", numeric: true },
    { header: t("colStatus"), width: "130px" },
  ];
  const batchCols: Column[] = [
    { header: t("colBatch"), width: "1fr" },
    { header: t("colExpiry"), width: "95px" },
    { header: t("colQty"), width: "50px", numeric: true },
    { header: t("colStatus"), width: "110px" },
  ];

  return (
    <>
      <PageHeader
        title={t("title")}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => void apiDownload("/catalog/export/", "items.csv")}
            >
              {t("export")}
            </Button>
            {canManage && (
              <>
                <Link
                  href="/inventory/import"
                  className={cn(buttonClasses({ variant: "outline" }), "no-underline")}
                >
                  {t("import")}
                </Link>
                <Button onClick={() => setForm({ open: true, item: null })}>{t("newItem")}</Button>
              </>
            )}
          </>
        }
      />
      <div className="grid grid-cols-12 items-start gap-[16px]">
        <section className="col-span-8 min-w-0 max-[1180px]:col-span-12">
          <Panel
            title={t("items")}
            note={t("count", { count: page.count.toLocaleString("en-US") })}
            chips={
              <>
                <button
                  type="button"
                  onClick={() => setCategory("")}
                  className="contents cursor-pointer"
                >
                  <Chip active={!category}>{t("chipAll")}</Chip>
                </button>
                <label className="relative">
                  <Chip active={!!category}>
                    {category
                      ? `${pick(ar, categories.find((c) => c.code === category) ?? { name_ar: "", name_en: "" })} ▾`
                      : t("chipCategory")}
                  </Chip>
                  <select
                    aria-label={t("chipCategory")}
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="absolute inset-0 cursor-pointer opacity-0"
                  >
                    <option value="">{t("chipAll")}</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.code}>
                        {pick(ar, c)}
                      </option>
                    ))}
                  </select>
                </label>
                <span aria-disabled="true" className="opacity-60">
                  <Chip>{t("chipExpiry")}</Chip>
                </span>
                <span aria-disabled="true" className="opacity-60">
                  <Chip>{t("chipSupplier")}</Chip>
                </span>
                <span aria-disabled="true" className="opacity-60">
                  <Chip>{t("chipBranch")}</Chip>
                </span>
                <label className="ms-auto flex items-center gap-[6px] rounded-full border border-line px-[12px] py-[2px] text-[13px] text-muted focus-within:border-primary">
                  <SearchIcon size={14} />
                  <input
                    type="search"
                    aria-label={t("search")}
                    placeholder={t("search")}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="w-[160px] border-0 bg-transparent p-0 text-[13px] text-ink outline-none"
                  />
                </label>
              </>
            }
          >
            <div role="table" aria-label={t("items")}>
              <TableHead columns={columns} />
              {page.results.map((item) => (
                <TableRow
                  key={item.id}
                  columns={columns}
                  selected={selected?.id === item.id}
                  onActivate={() => {
                    setSelected(item);
                    setDrawer(item.id);
                  }}
                >
                  <TextCell>
                    {itemLabel(ar, item)}
                    {item.classification === "rx" && (
                      <span className="ms-[6px] rounded-[4px] border border-info px-[4px] text-[11px] font-semibold text-info">
                        {t("rx")}
                      </span>
                    )}
                  </TextCell>
                  <CodeCell>{strengthForm(item)}</CodeCell>
                  <NumberCell>{DASH}</NumberCell>
                  <CodeCell>{DASH}</CodeCell>
                  <NumberCell>{DASH}</NumberCell>
                  <NumberCell>{amount(item.price) || DASH}</NumberCell>
                  <span role="cell" className="justify-self-start">
                    {!item.is_active && (
                      <Badge tone="danger" dense>
                        {t("inactive")}
                      </Badge>
                    )}
                  </span>
                </TableRow>
              ))}
              {page.results.length === 0 && <TableEmpty>{t("noItems")}</TableEmpty>}
            </div>
            {page.next && (
              <div className="p-[12px] text-center">
                <Button variant="quiet" onClick={() => void load(page.results.length)}>
                  {t("more")}
                </Button>
              </div>
            )}
          </Panel>
        </section>
        <section className="col-span-4 min-w-0 max-[1180px]:col-span-12">
          <Panel title={selected ? t("batchesFor", { item: selected.name_en }) : t("tabBatches")}>
            <TableHead columns={batchCols} />
            <TableEmpty>{selected ? t("batchesNone") : t("pickItem")}</TableEmpty>
          </Panel>
        </section>
      </div>
      <ItemDrawer
        itemId={drawer}
        ar={ar}
        canManage={canManage}
        version={version}
        onClose={() => setDrawer(null)}
        onEdit={(item) => setForm({ open: true, item })}
        onNewPrice={(item) => setPriceFor(item)}
      />
      <ItemFormDialog
        open={form.open}
        item={form.item}
        ar={ar}
        categories={categories}
        onClose={() => setForm({ open: false, item: null })}
        onSaved={saved}
      />
      {priceFor && (
        <PriceDialog
          item={priceFor}
          ar={ar}
          open
          onClose={() => setPriceFor(null)}
          onSaved={saved}
        />
      )}
    </>
  );
}
