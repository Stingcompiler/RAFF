import type { Schemas } from "@/lib/api/types";

export type ReturnableSale = Schemas["ReturnableSale"];
export type ReturnableLine = Schemas["ReturnableLine"];
export type ReturnRow = Schemas["ReturnList"];
export type QuarantineRow = Schemas["QuarantineEntry"];
export type Decision = "restock" | "destroy" | "return";

/** A base quantity in the item's sale unit when it divides evenly, else in base units. */
export function packs(base: number, unit: Schemas["UnitNames"], ar: boolean): string {
  const factor = unit.factor || 1;
  return base % factor === 0
    ? `${base / factor} ${ar ? unit.name_ar : unit.name_en}`
    : `${base} ${ar ? unit.base_ar : unit.base_en}`;
}

export function errorCode(error: Record<string, unknown> | null): string {
  const detail = error?.detail;
  return typeof detail === "string" ? detail : "failed";
}

const ERRORS = [
  "exceeds_sold",
  "shift_closed",
  "no_customer",
  "batch_expired",
  "no_supplier",
  "already_decided",
  "nothing_to_recall",
  "failed",
] as const;
export type ErrorKey = (typeof ERRORS)[number];
export const errorKey = (code: string): ErrorKey =>
  (ERRORS as readonly string[]).includes(code) ? (code as ErrorKey) : "failed";
