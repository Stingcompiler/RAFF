"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import { PageHeader } from "@/components/shell/PageHeader";
import { StaleNote } from "@/components/ui/StaleNote";
import { StaleStamp } from "@/components/ui/StaleStamp";
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
  type Column,
} from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { apiDownload, apiGet } from "@/lib/api/browser";
import type { Schemas } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { amount } from "@/lib/format";
import { usePhone } from "@/lib/phone";

import { ItemDrawer } from "./ItemDrawer";
import { ItemFormDialog } from "./ItemFormDialog";
import {
  BATCH_TONE,
  type BatchRow,
  inSaleUnit,
  type ItemDetail,
  itemLabel,
  pick,
  STOCK_TONE,
  type StockRow,
  strengthForm,
} from "./labels";
import { PhoneSearch } from "./PhoneSearch";
import { PriceDialog } from "./PriceDialog";

type Page = { count: number; next: string | null; results: StockRow[] };
const DASH = "—";
const PAGE = 50;

type Props = {
  initial: Page;
  categories: Schemas["Category"][];
  canManage: boolean;
  canReceive: boolean;
};

/** Items & stock: the table on a computer, quick item cards on a phone (Raff Mobile). */
export function InventoryScreen(props: Props) {
  const phone = usePhone();
  return phone ? <PhoneSearch initial={props.initial} /> : <InventoryDesktop {...props} />;
}

/** Items & stock (Raff Screens › الأصناف والمخزون). Stock columns fill in with WO-04. */
function InventoryDesktop({ initial, categories, canManage, canReceive }: Props) {
  const t = useTranslations("inventory");
  const ar = useLocale() === "ar";
  const toast = useToast();
  const [page, setPage] = useState<Page>(initial);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [stale, setStale] = useState(false);
  const [selected, setSelected] = useState<StockRow | null>(null);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [drawer, setDrawer] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [stamp, setStamp] = useState(() => new Date().toISOString());
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
      const res = await apiGet<Page>(`/inventory/items/?${params}`);
      setStale(!res.ok);
      if (res.ok) {
        setStamp(new Date().toISOString());
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

  useEffect(() => {
    if (!selected) return;
    let live = true;
    void apiGet<BatchRow[]>(`/inventory/items/${selected.id}/batches/`).then((res) => {
      if (live && res.ok) setBatches(res.data);
    });
    return () => {
      live = false;
    };
  }, [selected, version]);

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
            <StaleStamp at={stamp} onRefresh={() => void load(0)} />
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
      <StaleNote show={stale} />
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
                <label className="ms-auto flex items-center gap-[6px] rounded-full border border-border-strong px-[12px] py-[2px] text-label text-text-muted focus-within:border-brand">
                  <SearchIcon size={14} />
                  <input
                    type="search"
                    aria-label={t("search")}
                    placeholder={t("search")}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="w-[160px] border-0 bg-transparent p-0 text-label text-text outline-none"
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
                    setBatches([]);
                    setSelected(item);
                    setDrawer(item.id);
                  }}
                >
                  <span role="cell" className="flex min-w-0 items-center gap-[6px]">
                    <span className="truncate">{itemLabel(ar, item)}</span>
                    {item.classification === "rx" && (
                      <span className="flex-none rounded-[4px] border border-info-solid px-[4px] text-caption font-semibold text-info-text">
                        {t("rx")}
                      </span>
                    )}
                  </span>
                  <CodeCell>{strengthForm(item)}</CodeCell>
                  <NumberCell>
                    {inSaleUnit(item.stock.sellable_base, item.sale_unit?.factor)}
                  </NumberCell>
                  <CodeCell>{item.stock.nearest_expiry ?? DASH}</CodeCell>
                  <NumberCell>{amount(item.stock.cost_per_sale_unit) || DASH}</NumberCell>
                  <NumberCell>{amount(item.price) || DASH}</NumberCell>
                  <span role="cell" className="justify-self-start">
                    {item.is_active ? (
                      <Badge tone={STOCK_TONE[item.stock.status]} dense>
                        {t(`status.${item.stock.status}`)}
                      </Badge>
                    ) : (
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
            <div role="table" aria-label={t("tabBatches")}>
              <TableHead columns={batchCols} />
              {selected &&
                batches.map((b) => (
                  <TableRow key={`${b.batch_id}-${b.location}`} columns={batchCols}>
                    <CodeCell>{b.batch_no}</CodeCell>
                    <CodeCell>{b.expiry_date ?? DASH}</CodeCell>
                    <NumberCell>
                      {inSaleUnit(b.quantity_base, selected.sale_unit?.factor)}
                    </NumberCell>
                    <span role="cell" className="justify-self-start">
                      <Badge tone={BATCH_TONE[b.status]} dense>
                        {t(`batch.${b.status}`)}
                      </Badge>
                    </span>
                  </TableRow>
                ))}
              {(!selected || batches.length === 0) && (
                <TableEmpty>{selected ? t("batchesNone") : t("pickItem")}</TableEmpty>
              )}
            </div>
          </Panel>
        </section>
      </div>
      <ItemDrawer
        itemId={drawer}
        ar={ar}
        canManage={canManage}
        canReceive={canReceive}
        version={version}
        onClose={() => setDrawer(null)}
        onEdit={(item) => setForm({ open: true, item })}
        onNewPrice={(item) => setPriceFor(item)}
        onStockChanged={() => {
          setVersion((v) => v + 1);
          void load(0);
        }}
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
