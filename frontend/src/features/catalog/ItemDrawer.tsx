"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Drawer, DrawerRow } from "@/components/ui/Drawer";
import { Field, TextInput } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { apiGet, apiSend } from "@/lib/api/browser";
import type { Schemas } from "@/lib/api/types";
import { amount } from "@/lib/format";

import {
  BATCH_TONE,
  type BatchRow,
  inSaleUnit,
  type ItemDetail,
  pick,
  type StockRow,
  strengthForm,
} from "./labels";

const DASH = "—";
const CLOSE = "✕";

const TABS = [
  "tabDetails",
  "tabUnits",
  "tabBatches",
  "tabMovements",
  "tabPrices",
  "tabStore",
] as const;

type Props = {
  itemId: string | null;
  ar: boolean;
  canManage: boolean;
  canReceive: boolean;
  onClose: () => void;
  onStockChanged: () => void;
  onEdit: (item: ItemDetail) => void;
  onNewPrice: (item: ItemDetail) => void;
  /** Bumped by the parent after a save to reload the detail. */
  version: number;
};

/** Item details drawer (Raff Screens › items): six tabs of key/value rows. */
export function ItemDrawer({
  itemId,
  ar,
  canManage,
  canReceive,
  onClose,
  onEdit,
  onNewPrice,
  onStockChanged,
  version,
}: Props) {
  const t = useTranslations("inventory");
  const toast = useToast();
  const [tab, setTab] = useState(0);
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [stock, setStock] = useState<StockRow | null>(null);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [moves, setMoves] = useState<Schemas["Movement"][]>([]);
  const [releasing, setReleasing] = useState<BatchRow | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!itemId) return;
    let live = true;
    void Promise.all([
      apiGet<ItemDetail>(`/catalog/items/${itemId}/`),
      apiGet<StockRow>(`/inventory/items/${itemId}/`),
      apiGet<BatchRow[]>(`/inventory/items/${itemId}/batches/`),
      apiGet<Schemas["Movement"][]>(`/inventory/items/${itemId}/movements/`),
    ]).then(([detail, st, bs, ms]) => {
      if (!live) return;
      if (detail.ok) setItem(detail.data);
      setStock(st.ok ? st.data : null);
      setBatches(bs.ok ? bs.data : []);
      setMoves(ms.ok ? ms.data : []);
    });
    return () => {
      live = false;
    };
  }, [itemId, version, reload]);

  async function release(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!releasing) return;
    const expiry = new FormData(e.currentTarget).get("expiry");
    const res = await apiSend("POST", `/inventory/batches/${releasing.batch_id}/release/`, {
      expiry_date: expiry,
    });
    setReleasing(null);
    if (!res.ok) {
      toast.push("danger", t("errors.failed"));
      return;
    }
    toast.push("success", t("released"));
    setReload((r) => r + 1);
    onStockChanged();
  }

  const open = !!itemId;
  const current = item && item.id === itemId ? item : null;
  const base = current?.units.find((u) => u.is_base);
  const retail = current?.prices.find(
    (p) => p.price_list === "retail" && p.unit === current.sale_unit?.code,
  );
  const wholesale = current?.prices.find((p) => p.price_list === "wholesale");

  return (
    <Drawer open={open} onClose={onClose} labelledBy="item-drawer-title">
      {current && (
        <>
          <div className="flex items-center gap-[12px] border-b border-border px-[20px] py-[16px]">
            <div className="min-w-0 flex-1">
              <div id="item-drawer-title" className="text-lead font-medium">
                {ar
                  ? `${current.name_ar} · ${current.name_en}`
                  : `${current.name_en} · ${current.generic_name}`}
              </div>
              <div dir="ltr" className="text-start text-label text-text-muted num">
                {[strengthForm(current), current.sale_unit?.barcodes[0]]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("close")}
              className="size-[44px] cursor-pointer rounded-control border border-border-strong bg-transparent text-lead text-text"
            >
              {CLOSE}
            </button>
          </div>
          <div
            role="tablist"
            className="flex gap-[16px] overflow-hidden border-b border-border px-[20px]"
          >
            {TABS.map((key, i) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={i === tab}
                onClick={() => setTab(i)}
                className={cn(
                  "cursor-pointer border-0 bg-transparent px-[2px] py-[12px] text-label font-medium whitespace-nowrap transition-[color,box-shadow] duration-(--motion-feedback) [font-family:inherit]",
                  i === tab
                    ? "text-brand shadow-[inset_0_-2px_0_var(--color-brand)]"
                    : "text-text-muted shadow-[inset_0_-2px_0_transparent]",
                )}
              >
                {t(key)}
              </button>
            ))}
          </div>
          <div role="tabpanel" className="flex-1 overflow-auto">
            {tab === 0 && (
              <>
                <DrawerRow label={t("code")}>
                  <span className="num" dir="ltr">
                    {current.code}
                  </span>
                </DrawerRow>
                <DrawerRow label={t("generic")}>
                  <span className="num" dir="ltr">
                    {current.generic_name}
                  </span>
                </DrawerRow>
                <DrawerRow label={t("category")}>
                  {current.category ? pick(ar, current.category) : ""}
                </DrawerRow>
                <DrawerRow label={t("baseUnit")}>{base ? pick(ar, base) : ""}</DrawerRow>
                <DrawerRow label={t("reorder")}>{current.reorder_level_base}</DrawerRow>
                <DrawerRow label={t("classification")}>
                  {current.classification === "rx" ? t("rxLong") : t("otc")}
                </DrawerRow>
                {canManage && (
                  <div className="p-[20px]">
                    <Button variant="outline" onClick={() => onEdit(current)}>
                      {t("edit")}
                    </Button>
                  </div>
                )}
              </>
            )}
            {tab === 1 &&
              current.units.map((u) => (
                <div key={u.id}>
                  <DrawerRow label={pick(ar, u)}>
                    <span className="num" dir="ltr">
                      {u.is_base
                        ? "1"
                        : t("unitEq", { factor: u.factor, base: base?.name_en ?? "" })}
                    </span>
                  </DrawerRow>
                  {u.barcodes.map((code) => (
                    <DrawerRow key={code} label={`${t("barcode")} · ${pick(ar, u)}`}>
                      <span className="num" dir="ltr">
                        {code}
                      </span>
                    </DrawerRow>
                  ))}
                </div>
              ))}
            {tab === 2 &&
              (batches.length === 0 ? (
                <p className="m-0 p-[20px] text-text-muted">{t("batchesNone")}</p>
              ) : (
                batches.map((b) => {
                  const label = [b.batch_no, b.expiry_date].filter(Boolean).join(" · ");
                  const state = [
                    t(`batch.${b.status}`),
                    inSaleUnit(b.quantity_base, current.sale_unit?.factor),
                  ].join(" · ");
                  return (
                    <DrawerRow
                      key={`${b.batch_id}-${b.location}`}
                      label={
                        <span className="num" dir="ltr">
                          {label}
                        </span>
                      }
                    >
                      <span className="flex items-center gap-[8px]">
                        <Badge tone={BATCH_TONE[b.status]} dense>
                          {state}
                        </Badge>
                        {b.status === "held" && b.location === "review" && canReceive && (
                          <Button
                            variant="quiet"
                            className="h-[32px] px-[8px]"
                            onClick={() => setReleasing(b)}
                          >
                            {t("release")}
                          </Button>
                        )}
                      </span>
                    </DrawerRow>
                  );
                })
              ))}
            {tab === 3 &&
              (moves.length === 0 ? (
                <p className="m-0 p-[20px] text-text-muted">{t("noMovements")}</p>
              ) : (
                moves.map((m) => {
                  const when = m.created_at.slice(0, 16).replace("T", " ");
                  const sign = m.quantity_base > 0 ? "+" : "−";
                  const text = [
                    t(`move.${m.kind}`),
                    sign + inSaleUnit(Math.abs(m.quantity_base), current.sale_unit?.factor),
                  ].join(" ");
                  return (
                    <DrawerRow
                      key={m.id}
                      label={
                        <span className="num" dir="ltr">
                          {when}
                        </span>
                      }
                    >
                      {text}
                    </DrawerRow>
                  );
                })
              ))}
            {tab === 4 && (
              <>
                <DrawerRow label={t("cost")}>
                  {amount(stock?.stock.cost_per_sale_unit) || DASH}
                </DrawerRow>
                <DrawerRow label={t("retail")}>{retail ? amount(retail.price) : DASH}</DrawerRow>
                <DrawerRow label={t("wholesale")}>
                  {wholesale ? amount(wholesale.price) : DASH}
                </DrawerRow>
                <DrawerRow label={t("margin")}>
                  {stock?.stock.margin_pct ? `${stock.stock.margin_pct}%` : DASH}
                </DrawerRow>
                <div className="px-[20px] pt-[16px] pb-[4px] text-caption font-medium text-text-muted">
                  {t("priceHistory")}
                </div>
                {current.prices.map((p) => {
                  const list = p.price_list === "retail" ? t("retail") : t("wholesale");
                  const text = [list, amount(p.price)].join(" · ");
                  return (
                    <DrawerRow
                      key={p.id}
                      label={
                        <span className="num" dir="ltr">
                          {p.effective_from}
                        </span>
                      }
                    >
                      {text}
                    </DrawerRow>
                  );
                })}
                {canManage && (
                  <div className="p-[20px]">
                    <Button variant="outline" onClick={() => onNewPrice(current)}>
                      {t("newPrice")}
                    </Button>
                  </div>
                )}
              </>
            )}
            {tab === 5 && (
              <>
                <DrawerRow label={t("published")}>
                  {current.published ? t("yes") : t("no")}
                </DrawerRow>
                <DrawerRow label={t("classification")}>
                  {current.classification === "rx" ? t("rxLong") : t("otc")}
                </DrawerRow>
              </>
            )}
          </div>
        </>
      )}
      <Dialog open={!!releasing} onClose={() => setReleasing(null)} labelledBy="release-title">
        <form onSubmit={release} className="grid gap-[12px]">
          <div id="release-title" className="text-lead font-medium">
            {t("releaseTitle")}
          </div>
          <div dir="ltr" className="text-start text-text-muted num">
            {releasing?.batch_no}
          </div>
          <Field label={t("expiry")}>
            {({ id }) => (
              <TextInput className="num" id={id} name="expiry" type="date" dir="ltr" required />
            )}
          </Field>
          <div className="flex justify-end gap-[8px]">
            <Button variant="outline" size="lg" onClick={() => setReleasing(null)}>
              {t("cancel")}
            </Button>
            <Button type="submit" size="lg">
              {t("release")}
            </Button>
          </div>
        </form>
      </Dialog>
    </Drawer>
  );
}
