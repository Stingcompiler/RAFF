"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Drawer, DrawerRow } from "@/components/ui/Drawer";
import { cn } from "@/lib/cn";
import { apiGet } from "@/lib/api/browser";
import { amount } from "@/lib/format";

import { type ItemDetail, pick, strengthForm } from "./labels";

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
  onClose: () => void;
  onEdit: (item: ItemDetail) => void;
  onNewPrice: (item: ItemDetail) => void;
  /** Bumped by the parent after a save to reload the detail. */
  version: number;
};

/** Item details drawer (Raff Screens › items): six tabs of key/value rows. */
export function ItemDrawer({ itemId, ar, canManage, onClose, onEdit, onNewPrice, version }: Props) {
  const t = useTranslations("inventory");
  const [tab, setTab] = useState(0);
  const [item, setItem] = useState<ItemDetail | null>(null);

  useEffect(() => {
    if (!itemId) return;
    let live = true;
    void apiGet<ItemDetail>(`/catalog/items/${itemId}/`).then((res) => {
      if (live && res.ok) setItem(res.data);
    });
    return () => {
      live = false;
    };
  }, [itemId, version]);

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
          <div className="flex items-center gap-[12px] border-b border-line px-[20px] py-[16px]">
            <div className="min-w-0 flex-1">
              <div id="item-drawer-title" className="text-[16px] font-medium">
                {ar
                  ? `${current.name_ar} · ${current.name_en}`
                  : `${current.name_en} · ${current.generic_name}`}
              </div>
              <div dir="ltr" className="text-start text-[13px] text-muted">
                {[strengthForm(current), current.sale_unit?.barcodes[0]]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("close")}
              className="size-[44px] cursor-pointer rounded-[10px] border border-line bg-transparent text-[18px] text-ink"
            >
              {CLOSE}
            </button>
          </div>
          <div
            role="tablist"
            className="flex gap-[16px] overflow-hidden border-b border-line px-[20px]"
          >
            {TABS.map((key, i) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={i === tab}
                onClick={() => setTab(i)}
                className={cn(
                  "cursor-pointer border-0 bg-transparent px-[2px] py-[12px] text-[13px] font-medium whitespace-nowrap transition-[color,box-shadow] duration-200 [font-family:inherit]",
                  i === tab
                    ? "text-primary shadow-[inset_0_-2px_0_var(--color-primary)]"
                    : "text-muted shadow-[inset_0_-2px_0_transparent]",
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
                  <span dir="ltr">{current.code}</span>
                </DrawerRow>
                <DrawerRow label={t("generic")}>
                  <span dir="ltr">{current.generic_name}</span>
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
                    <span dir="ltr">
                      {u.is_base
                        ? "1"
                        : t("unitEq", { factor: u.factor, base: base?.name_en ?? "" })}
                    </span>
                  </DrawerRow>
                  {u.barcodes.map((code) => (
                    <DrawerRow key={code} label={`${t("barcode")} · ${pick(ar, u)}`}>
                      <span dir="ltr">{code}</span>
                    </DrawerRow>
                  ))}
                </div>
              ))}
            {tab === 2 && <p className="m-0 p-[20px] text-muted">{t("batchesNone")}</p>}
            {tab === 3 && <p className="m-0 p-[20px] text-muted">{t("noMovements")}</p>}
            {tab === 4 && (
              <>
                <DrawerRow label={t("cost")}>{DASH}</DrawerRow>
                <DrawerRow label={t("retail")}>{retail ? amount(retail.price) : DASH}</DrawerRow>
                <DrawerRow label={t("wholesale")}>
                  {wholesale ? amount(wholesale.price) : DASH}
                </DrawerRow>
                <DrawerRow label={t("margin")}>{DASH}</DrawerRow>
                <div className="px-[20px] pt-[16px] pb-[4px] text-[12px] font-medium text-muted">
                  {t("priceHistory")}
                </div>
                {current.prices.map((p) => {
                  const list = p.price_list === "retail" ? t("retail") : t("wholesale");
                  const text = [list, amount(p.price)].join(" · ");
                  return (
                    <DrawerRow key={p.id} label={<span dir="ltr">{p.effective_from}</span>}>
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
                <DrawerRow label={t("published")}>{t("no")}</DrawerRow>
                <DrawerRow label={t("classification")}>
                  {current.classification === "rx" ? t("rxLong") : t("otc")}
                </DrawerRow>
              </>
            )}
          </div>
        </>
      )}
    </Drawer>
  );
}
