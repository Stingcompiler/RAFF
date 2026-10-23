"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { useToast } from "@/components/ui/Toast";
import { NoImageIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";

import { cart } from "./cart";
import { type Product, productName } from "./types";

export const AVAIL_TONE = {
  available: "text-success-text bg-success-bg",
  confirm: "text-warning-text bg-warning-bg",
  unavailable: "text-info-text bg-info-bg",
} as const;

export const BUTTON = {
  solid: "border-0 bg-brand text-on-brand",
  outline: "border border-brand bg-transparent text-brand",
  muted: "border border-border-strong bg-transparent text-text-muted",
} as const;

export function ProductImage({
  product,
  height,
  label,
}: {
  product: Product;
  height: string;
  label: string;
}) {
  return product.image ? (
    // eslint-disable-next-line @next/next/no-img-element -- pharmacy uploads, served from /media
    <img
      src={product.image}
      alt={productName(true, product)}
      className={cn("block w-full object-cover", height)}
    />
  ) : (
    <div
      className={cn(
        "grid place-content-center justify-items-center gap-[4px] bg-surface-subtle text-[12px] text-text-muted",
        height,
      )}
    >
      <NoImageIcon size={28} />
      {label}
    </div>
  );
}

/** ProductCard (STOREFRONT-DESIGN-CHANGES §3): availability in words, never stock numbers. */
export function ProductTile({ product }: { product: Product }) {
  const t = useTranslations("store");
  const ar = useLocale() === "ar";
  const toast = useToast();
  const off = product.availability === "unavailable";
  const href = `/products/${product.slug}`;
  return (
    <article className="grid grid-rows-[auto_1fr] overflow-hidden rounded-card border border-border bg-surface transition-[box-shadow,transform] duration-(--motion-feedback) hover:-translate-y-[2px] hover:shadow-tile">
      <Link href={href} tabIndex={-1} aria-hidden="true">
        <ProductImage product={product} height="h-[120px]" label={t("noImg")} />
      </Link>
      <div className="grid content-start gap-[8px] p-[14px]">
        <Link href={href} className="text-text no-underline">
          <div className="text-[16px] leading-[1.3] font-semibold">{productName(ar, product)}</div>
          {ar && (
            <bdi dir="ltr" className="text-[12px] text-text-muted [unicode-bidi:isolate]">
              {product.name_en}
            </bdi>
          )}
        </Link>
        <div className="text-[13px] text-text-muted">{ar ? product.unit_ar : product.unit_en}</div>
        {product.rx ? (
          <div className="rounded-control bg-info-bg px-[10px] py-[8px] text-[13px] font-medium text-info-text">
            {t("rxShort")}
          </div>
        ) : (
          <>
            {product.price && (
              <div className="flex flex-wrap items-baseline gap-[10px]">
                <span className="text-[18px] font-semibold tabular-nums">
                  {money(product.price, ar ? "ar" : "en")}
                </span>
                <span className="text-[12px] whitespace-nowrap text-text-muted">
                  {t("updated")}{" "}
                  <bdi dir="ltr" className="[unicode-bidi:isolate]">
                    {product.price_date}
                  </bdi>
                </span>
              </div>
            )}
            {product.availability && (
              <span
                className={cn(
                  "justify-self-start rounded-full px-[10px] py-[3px] text-[13px] font-semibold whitespace-nowrap",
                  AVAIL_TONE[product.availability],
                )}
              >
                {t(`avail.${product.availability}`)}
              </span>
            )}
          </>
        )}
        {product.rx ? (
          <Link
            href={`/checkout?rx=${product.slug}`}
            className={cn(
              "inline-flex min-h-[44px] items-center justify-center rounded-control px-[16px] text-[15px] font-semibold whitespace-nowrap max-[480px]:px-[8px] max-[480px]:py-[8px] max-[480px]:text-[14px] max-[480px]:leading-[1.3] max-[480px]:whitespace-normal max-[480px]:text-center no-underline",
              BUTTON.outline,
            )}
          >
            {t("requestReview")}
          </Link>
        ) : off ? (
          <Link
            href={href}
            className={cn(
              "inline-flex min-h-[44px] items-center justify-center rounded-control px-[16px] text-[15px] font-semibold whitespace-nowrap max-[480px]:px-[8px] max-[480px]:py-[8px] max-[480px]:text-[14px] max-[480px]:leading-[1.3] max-[480px]:whitespace-normal max-[480px]:text-center no-underline",
              BUTTON.muted,
            )}
          >
            {t("details")}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => {
              cart.add(product.slug, 1);
              toast.push("success", t("added"));
            }}
            className={cn(
              "min-h-[44px] cursor-pointer rounded-control px-[16px] text-[15px] font-semibold whitespace-nowrap max-[480px]:px-[8px] max-[480px]:py-[8px] max-[480px]:text-[14px] max-[480px]:leading-[1.3] max-[480px]:whitespace-normal max-[480px]:text-center transition-[transform] duration-(--motion-feedback) active:scale-[.98]",
              BUTTON.solid,
            )}
          >
            {t("add")}
          </button>
        )}
      </div>
    </article>
  );
}
