import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { AddToCart } from "@/features/store/AddToCart";
import { AVAIL_TONE, ProductImage } from "@/features/store/ProductTile";
import { type ProductDetail, productName } from "@/features/store/types";
import { serverGet } from "@/lib/api/server";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";

/** Product page (§4.3). No automatic alternatives; Rx items have no price and no cart. */
export default async function ProductPage({ params }: PageProps<"/products/[slug]">) {
  const { slug } = await params;
  const t = await getTranslations("store");
  const ar = (await getLocale()) === "ar";
  const product = await serverGet<ProductDetail>(`/public/products/${encodeURIComponent(slug)}/`);
  if (!product) notFound();
  return (
    <section className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-[28px] px-[20px] py-[24px]">
      <div className="overflow-hidden rounded-[16px]">
        <ProductImage product={product} height="h-[340px]" label={t("noImgL")} />
      </div>
      <div className="grid content-start gap-[12px]">
        <Link href="/store" className="min-h-[24px] text-[14px] text-brand">
          {t("backStore")}
        </Link>
        <h1 className="m-0 text-[32px] font-semibold">{productName(ar, product)}</h1>
        <bdi dir="ltr" className="text-text-muted [unicode-bidi:isolate]">
          {[product.name_en, product.strength].filter(Boolean).join(" · ")}
        </bdi>
        <div className="text-text-secondary">
          {t("unitL")}
          {ar ? product.unit_ar : product.unit_en}
        </div>
        {product.rx ? (
          <div className="rounded-[8px] bg-info-bg px-[10px] py-[8px] text-[14px] font-medium text-info-text">
            {t("rxLong")}
          </div>
        ) : (
          <>
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
            {product.price && (
              <div className="flex flex-wrap items-baseline gap-[10px]">
                <span className="text-[28px] font-semibold tabular-nums">
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
          </>
        )}
        <p className="m-0 max-w-[480px] leading-[1.7] text-text-secondary">
          {ar ? product.description_ar : product.description_en || product.description_ar}
        </p>
        <AddToCart product={product} />
      </div>
    </section>
  );
}
