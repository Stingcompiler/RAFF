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
