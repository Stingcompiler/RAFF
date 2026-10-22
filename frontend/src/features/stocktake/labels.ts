import type { Schemas } from "@/lib/api/types";

export type Take = Schemas["Stocktake"];
export type TakeDetail = Schemas["StocktakeDetail"];
export type TakeLine = Schemas["StocktakeLine"];

/** Base units shown in the sale unit: "21", or "21 +3" when loose base units remain. */
export function inUnits(base: number, factor: number): string {
  const f = factor || 1;
  const sign = base < 0 ? "-" : "";
  const abs = Math.abs(base);
  const whole = Math.floor(abs / f);
  const loose = abs % f;
  return loose ? `${sign}${whole} +${loose}` : `${sign}${whole}`;
}

export function signed(base: number, factor: number): string {
  return base > 0 ? `+${inUnits(base, factor)}` : inUnits(base, factor);
}

export function scopeLabel(
  take: Take,
  ar: boolean,
  t: (key: "scopeAll" | "scopeCategory", values?: { name: string }) => string,
): string {
  if (take.scope !== "category") return t("scopeAll");
  return t("scopeCategory", { name: (ar ? take.category_name_ar : take.category_name_en) ?? "" });
}

export function errorCode(error: Record<string, unknown> | null): string {
  const detail = error?.detail;
  return typeof detail === "string" ? detail : "failed";
}

const ERRORS = ["reason_required", "stocktake_approved", "no_batch_for_overage", "failed"] as const;
export type ErrorKey = (typeof ERRORS)[number];
export const errorKey = (code: string): ErrorKey =>
  (ERRORS as readonly string[]).includes(code) ? (code as ErrorKey) : "failed";
