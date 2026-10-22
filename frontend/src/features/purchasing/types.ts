import type { Schemas } from "@/lib/api/types";

export type Receipt = Schemas["Receipt"];
export type ReceiptLine = Schemas["ReceiptLine"];
export type Supplier = Schemas["Supplier"];

/** A line as edited in the browser; sent whole to the server, which computes every total. */
export type LineDraft = {
  item_id: string;
  unit_id: string;
  item_name_ar: string;
  item_name_en: string;
  unit_name_ar: string;
  unit_name_en: string;
  quantity: number;
  bonus_quantity: number;
  unit_cost: string;
  discount: string;
  batch_no: string;
  expiry_date: string | null;
};

export function fromLine(l: ReceiptLine): LineDraft {
  return {
    item_id: l.item,
    unit_id: l.unit,
    item_name_ar: l.item_name_ar,
    item_name_en: l.item_name_en,
    unit_name_ar: l.unit_name_ar,
    unit_name_en: l.unit_name_en,
    quantity: l.quantity,
    bonus_quantity: l.bonus_quantity ?? 0,
    unit_cost: l.unit_cost,
    discount: l.discount ?? "0",
    batch_no: l.batch_no,
    expiry_date: l.expiry_date ?? null,
  };
}
