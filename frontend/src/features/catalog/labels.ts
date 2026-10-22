import type { Schemas } from "@/lib/api/types";

export type ItemRow = Schemas["ItemList"];
export type ItemDetail = Schemas["ItemDetail"];

export const pick = (ar: boolean, o: { name_ar: string; name_en: string }) =>
  ar ? o.name_ar : o.name_en;

/** Arabic: "name_ar · name_en"; English: "name_en · generic". */
export function itemLabel(
  ar: boolean,
  item: Pick<ItemRow, "name_ar" | "name_en" | "generic_name">,
) {
  if (ar) return `${item.name_ar} · ${item.name_en}`;
  return item.generic_name ? `${item.name_en} · ${item.generic_name.toLowerCase()}` : item.name_en;
}

export const strengthForm = (item: Pick<ItemRow, "strength" | "dosage_form">) =>
  [item.strength, item.dosage_form].filter(Boolean).join(" ");

export type StockRow = Schemas["StockItem"];
export type BatchRow = Schemas["BatchRow"];

/** Base units shown in the item's sale unit: "34", or "34 +3" when loose base units remain. */
export function inSaleUnit(base: number, factor: number | undefined): string {
  const f = factor && factor > 0 ? factor : 1;
  const whole = Math.floor(base / f);
  const rest = base % f;
  return rest ? `${whole} +${rest}` : String(whole);
}

export const STOCK_TONE = {
  good: "success",
  near_expiry: "warn",
  low: "warn",
  out: "info",
  expired: "danger",
} as const;

export const BATCH_TONE = {
  good: "success",
  near_expiry: "warn",
  expired: "danger",
  held: "warn",
  quarantined: "danger",
} as const;
