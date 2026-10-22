"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { NoImageIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { multiply, sum } from "@/lib/decimal";
import { money } from "@/lib/format";

import { cart, useCart } from "./cart";
import { BUTTON } from "./ProductTile";
import { productName } from "./types";
import { useProducts } from "./useProducts";

const MINUS = "−";
const PLUS = "+";
const REMOVE = "✕";
const SEP = " · ";

/** Cart (§4.4): the total is an estimate, confirmed by the pharmacy. */
export function CartScreen() {
  const t = useTranslations("store");
  const ar = useLocale() === "ar";
  const lines = useCart();
  const { bySlug, ready } = useProducts();
  const rows = lines
    .map((l) => ({ line: l, product: bySlug.get(l.slug) }))
    .filter((r) => !ready || r.product);
  const estimate = sum(
    rows.map(({ line, product }) => (product?.price ? multiply(product.price, line.qty) : "0")),
  );
  return (
    <section className="grid gap-[16px] px-[20px] pt-[24px] pb-[40px]">
      <h1 className="m-0 text-[30px] font-semibold">{t("cart")}</h1>
      {ready && rows.length === 0 && (
        <div className="grid justify-items-center gap-[8px] rounded-[14px] border border-dashed border-line-strong px-[20px] py-[48px] text-center">
          <b>{t("emptyT")}</b>
          <span className="text-muted">{t("emptyB")}</span>
          <Link
            href="/store"
            className={cn(
              "inline-flex min-h-[44px] items-center rounded-[10px] px-[20px] font-semibold no-underline",
              BUTTON.outline,
            )}
          >
            {t("browse")}
          </Link>
        </div>
      )}
      <div className="grid gap-[10px]">
        {rows.map(({ line, product }) =>
          product ? (
            <div
              key={line.slug}
              data-testid="store-cart-line"
              className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-[12px] rounded-[12px] border border-line bg-surface p-[12px]"
            >
              <div className="grid h-[56px] place-items-center rounded-[8px] bg-placeholder-bg text-placeholder-ink">
                <NoImageIcon size={22} />
              </div>
              <div className="min-w-0">
                <div className="font-semibold">{productName(ar, product)}</div>
                <div className="text-[13px] text-muted">
                  {[
                    ar ? product.unit_ar : product.unit_en,
                    product.price ? money(product.price, ar ? "ar" : "en") : t("pharmacistReview"),
                  ].join(SEP)}
                  {product.price_date && (
                    <span className="text-[12px] whitespace-nowrap">
                      {SEP}
                      {t("updated")}{" "}
                      <bdi dir="ltr" className="[unicode-bidi:isolate]">
                        {product.price_date}
                      </bdi>
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-[8px]">
                <span className="flex items-center overflow-hidden rounded-[8px] border border-line-strong">
                  <button
                    type="button"
                    aria-label={t("decrease")}
                    onClick={() => cart.set(line.slug, line.qty - 1)}
                    className="type-inherit grid h-[44px] w-[40px] cursor-pointer place-items-center border-0 bg-transparent text-ink"
                  >
                    {MINUS}
                  </button>
                  <span dir="ltr" className="w-[32px] text-center font-semibold">
                    {line.qty}
                  </span>
                  <button
                    type="button"
                    aria-label={t("increase")}
                    onClick={() => cart.set(line.slug, line.qty + 1)}
                    className="type-inherit grid h-[44px] w-[40px] cursor-pointer place-items-center border-0 bg-transparent text-ink"
                  >
                    {PLUS}
                  </button>
                </span>
                <button
                  type="button"
                  aria-label={t("del")}
                  onClick={() => cart.set(line.slug, 0)}
                  className="type-inherit grid size-[44px] cursor-pointer place-items-center border-0 bg-transparent text-muted"
                >
                  {REMOVE}
                </button>
              </div>
            </div>
          ) : null,
        )}
      </div>
      {rows.length > 0 && (
        <div className="grid max-w-[520px] gap-[10px] rounded-[14px] border border-line bg-surface p-[18px]">
          <div className="flex items-baseline justify-between">
            <span className="font-medium">{t("est")}</span>
            <span
              dir="ltr"
              data-testid="store-estimate"
              className="text-[26px] font-semibold tabular-nums"
            >
              {money(estimate, ar ? "ar" : "en") || money("0", ar ? "ar" : "en")}
            </span>
          </div>
          <div className="rounded-[8px] bg-warn-bg px-[12px] py-[10px] text-[14px] font-medium text-warn">
            {t("cartNote")}
          </div>
          <Link
            href="/checkout"
            className={cn(
              "inline-flex min-h-[52px] items-center justify-center rounded-[12px] text-[16px] font-semibold no-underline",
              BUTTON.solid,
            )}
          >
            {t("send")}
          </Link>
        </div>
      )}
    </section>
  );
}
