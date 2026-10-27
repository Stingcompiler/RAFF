import type { Schemas } from "@/lib/api/types";

export type Product = Schemas["PublicProduct"];
export type ProductDetail = Schemas["PublicProductDetail"];
export type Store = Schemas["PublicStore"];
export type Category = Schemas["PublicCategory"];
export type PublicOrder = Schemas["PublicOrder"];

export const pick = (ar: boolean, o: { name_ar: string; name_en: string }) =>
  ar ? o.name_ar : o.name_en;

export const productName = (
  ar: boolean,
  p: { name_ar: string; name_en: string; strength: string },
) => [pick(ar, p), p.strength].filter(Boolean).join(" ");

/** Sudanese mobile numbers (the server checks again). */
export const PHONE = /^(?:\+?249|0)?[19]\d{8}$/;

export { waLink } from "@/lib/whatsapp";
