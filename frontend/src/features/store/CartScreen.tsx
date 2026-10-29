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
  const { bySlug, ready, failed, retry } = useProducts(lines.map((l) => l.slug));
  const rows = lines
    .map((l) => ({ line: l, product: bySlug.get(l.slug) }))
    .filter((r) => !ready || r.product);
  // Items the shop no longer offers stay visible with a way to remove them (review C-03).
  const gone = ready && !failed ? lines.filter((l) => !bySlug.has(l.slug)) : [];
  const estimate = sum(
    rows.map(({ line, product }) => (product?.price ? multiply(product.price, line.qty) : "0")),
  );
  return (
    <section className="mx-auto grid max-w-[960px] gap-[16px] px-[20px] pt-[32px] pb-[48px]">
      <h1 className="m-0 text-land-section font-semibold">{t("cart")}</h1>
      {failed && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-[8px] rounded-control bg-danger-bg px-[14px] py-[12px] font-medium text-danger-text"
        >
          {t("itemsUnreadable")}
          <button
            type="button"
            onClick={retry}
            className="min-h-[44px] cursor-pointer rounded-control border border-border-strong bg-surface px-[14px] font-medium text-text"
          >
            {t("checkAgain")}
          </button>
        </div>
      )}
      {gone.map((l) => (
        <div
          key={l.slug}
          role="status"
          data-testid="store-cart-gone"
          className="flex flex-wrap items-center justify-between gap-[8px] rounded-card border border-warning-solid bg-warning-bg px-[14px] py-[10px] font-medium text-warning-text"
        >
          {t("itemGone")}
          <button
            type="button"
            onClick={() => cart.set(l.slug, 0)}
            className="min-h-[44px] cursor-pointer rounded-control border border-border-strong bg-surface px-[14px] font-medium text-text"
          >
            {t("removeItem")}
          </button>
        </div>
      ))}
      {ready && !failed && lines.length === 0 && (
        <div className="grid justify-items-center gap-[8px] rounded-card border border-dashed border-border-strong px-[20px] py-[48px] text-center">
          <b>{t("emptyT")}</b>
          <span className="text-text-muted">{t("emptyB")}</span>
          <Link
            href="/store"
            className={cn(
              "inline-flex min-h-[44px] items-center rounded-control px-[20px] font-semibold no-underline",
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
              className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-[12px] rounded-card border border-border bg-surface p-[12px]"
            >
              <div className="grid h-[56px] place-items-center rounded-control bg-surface-subtle text-text-muted">
                <NoImageIcon size={22} />
              </div>
              <div className="min-w-0">
                <div className="font-semibold">{productName(ar, product)}</div>
                <div className="text-label text-text-muted">
                  {[
                    ar ? product.unit_ar : product.unit_en,
                    product.price ? money(product.price, ar ? "ar" : "en") : t("pharmacistReview"),
                  ].join(SEP)}
                  {product.price_date && (
                    <span className="text-caption whitespace-nowrap">
                      {SEP}
                      {t("updated")}{" "}
                      <bdi dir="ltr" className="num">
                        {product.price_date}
                      </bdi>
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-[8px]">
                <span className="flex items-center overflow-hidden rounded-control border border-border-strong">
                  <button
                    type="button"
                    aria-label={t("decrease")}
                    onClick={() => cart.set(line.slug, line.qty - 1)}
                    className="type-inherit grid h-[44px] w-[40px] cursor-pointer place-items-center border-0 bg-transparent text-text"
                  >
                    {MINUS}
                  </button>
                  <span dir="ltr" className="w-[32px] text-center font-semibold num">
                    {line.qty}
                  </span>
                  <button
                    type="button"
                    aria-label={t("increase")}
                    onClick={() => cart.set(line.slug, line.qty + 1)}
                    className="type-inherit grid h-[44px] w-[40px] cursor-pointer place-items-center border-0 bg-transparent text-text"
                  >
                    {PLUS}
                  </button>
                </span>
                <button
                  type="button"
                  aria-label={t("del")}
                  onClick={() => cart.set(line.slug, 0)}
                  className="type-inherit grid size-[44px] cursor-pointer place-items-center border-0 bg-transparent text-text-muted"
                >
                  {REMOVE}
                </button>
              </div>
            </div>
          ) : null,
        )}
      </div>
      {rows.length > 0 && (
        <div className="grid max-w-[520px] gap-[10px] rounded-card border border-border bg-surface p-[18px]">
          <div className="flex items-baseline justify-between">
            <span className="font-medium">{t("est")}</span>
            <span
              dir="ltr"
              data-testid="store-estimate"
              className="text-land-section font-semibold num"
            >
              {money(estimate, ar ? "ar" : "en") || money("0", ar ? "ar" : "en")}
            </span>
          </div>
          <div className="rounded-control bg-warning-bg px-[12px] py-[10px] text-body font-medium text-warning-text">
            {t("cartNote")}
          </div>
          <Link
            href="/checkout"
            className={cn(
              "inline-flex min-h-[48px] items-center justify-center rounded-card text-lead font-semibold no-underline",
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
