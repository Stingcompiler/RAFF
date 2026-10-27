import type { Schemas } from "@/lib/api/types";

export type PosItem = Schemas["PosItem"];
export type Unit = Schemas["Unit"];
export type Quote = Schemas["Quote"];
export type QuoteLine = Schemas["QuoteLine"];
export type Customer = Schemas["Customer"];
export type ShiftSummary = Schemas["ShiftSummary"];
export type HeldSale = Schemas["HeldSale"];
export type SaleResult = Schemas["SaleResult"];
export type Receipt = Schemas["SaleReceipt"];
export type BatchRow = Schemas["BatchRow"];
export type LineIn = Schemas["LineIn"];
export type PaymentIn = Schemas["PaymentIn"];
export type Method = "cash" | "bank" | "credit" | "split";

export type CartLine = {
  key: string;
  item: PosItem;
  unit: Unit;
  quantity: number;
  discountPct: number;
  /** null = automatic FEFO */
  batch: { id: string; no: string } | null;
  /** Lines loaded from a storefront order: their quantities and held batches are fixed. */
  locked?: boolean;
};

export type FromOrder = {
  id: string;
  number: string;
  customer_name: string;
  /** A verified bank transfer that already paid (part of) this order. */
  prepaid?: { reference: string; amount: string } | null;
  lines: { item: PosItem; unit_id: string; quantity: number }[];
};

export type SaleRequest = {
  lines: LineIn[];
  payments: PaymentIn[];
  customer_id: string | null;
  order_id?: string | null;
};

export const toLineIn = (line: CartLine): LineIn => ({
  item_id: line.item.id,
  unit_id: line.unit.id,
  quantity: line.quantity,
  discount_pct: String(line.discountPct),
  batch_id: line.batch?.id ?? null,
});

export const pick = (ar: boolean, o: { name_ar: string; name_en: string }) =>
  ar ? o.name_ar : o.name_en;

/** Whole sale units in a base quantity (display only). */
export const inUnit = (base: number, factor: number | undefined) =>
  Math.floor(base / (factor || 1));

/** Short reference shown to staff for an Idempotency-Key, e.g. REQ-8C21F0. */
export const requestRef = (key: string) => `REQ-${key.replace(/-/g, "").slice(0, 6).toUpperCase()}`;

/** API error code from a DRF error body ({"detail": "code", ...}). */
export function errorCode(error: Record<string, unknown> | null): string {
  const detail = error?.detail;
  return typeof detail === "string" ? detail : "failed";
}

const ERRORS = [
  "insufficient_stock",
  "payments_do_not_match_total",
  "tendered_too_low",
  "bank_reference_required",
  "customer_required",
  "credit_limit_exceeded",
  "shift_closed",
  "discount_not_allowed",
  "discount_too_high",
  "no_price",
  "prepaid_mismatch",
  "payment_unverified",
  "failed",
] as const;
export type ErrorKey = (typeof ERRORS)[number];

/** Message key under pos.errors for an API error code ("failed" when unknown). */
export const errorKey = (code: string): ErrorKey =>
  (ERRORS as readonly string[]).includes(code) ? (code as ErrorKey) : "failed";
