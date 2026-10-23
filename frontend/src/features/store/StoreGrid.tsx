import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { cn } from "@/lib/cn";
import { serverGet } from "@/lib/api/server";

import { ProductTile } from "./ProductTile";
import { type Category, type Product, type Store, waLink } from "./types";

type Filters = { q?: string; category?: string; availability?: string; sort?: string };

const chip = (on: boolean) =>
  cn(
    "inline-flex min-h-[44px] items-center rounded-full border px-[14px] text-[14px] font-medium whitespace-nowrap no-underline transition-[background,color] duration-(--motion-feedback)",
    on ? "border-brand bg-brand text-on-brand" : "border-border-strong bg-surface text-text",
  );
const seg = (on: boolean) =>
  cn(
    "hit-44 rounded-control px-[12px] py-[6px] text-[13px] font-medium whitespace-nowrap no-underline transition-[background] duration-(--motion-feedback)",
    on ? "bg-surface text-brand shadow-[0_1px_2px_rgb(0_0_0/.12)]" : "text-text-muted",
  );

/** Store and category pages (§4.2): search, category and availability filters, simple sort. */
export async function StoreGrid({ filters, base }: { filters: Filters; base: string }) {
  const t = await getTranslations("store");
  const ar = (await getLocale()) === "ar";
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
  const [store, categories, products] = await Promise.all([
    serverGet<Store>("/public/store/").catch(() => null),
    serverGet<Category[]>("/public/categories/").catch(() => null),
    serverGet<Product[]>(`/public/products/?${params}`).catch(() => null),
  ]);
  const href = (patch: Filters) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const path =
      patch.category !== undefined
        ? patch.category
          ? `/categories/${patch.category}`
          : "/store"
        : base;
    next.delete("category");
    const qs = next.toString();
    return qs ? `${path}?${qs}` : path;
  };
  const total = categories?.reduce((n, c) => n + c.count, 0) ?? 0;
  if (products === null) {
    return (
      <section className="px-[20px] py-[48px] text-center">
        <p className="text-text-muted">{t("loadError")}</p>
        <Link href={href({})} className={chip(false)}>
          {t("retry")}
        </Link>
      </section>
    );
  }
  return (
    <section className="px-[20px] pt-[24px] pb-[8px]">
      <div className="flex flex-wrap items-baseline justify-between gap-[12px]">
        <h1 className="m-0 text-[26px] font-semibold">
          {filters.q ? t("searchResults") : t("storeTitle")}
        </h1>
        <span className="text-[14px] whitespace-nowrap text-text-muted">
          {t("published", { count: total })}
        </span>
      </div>
      <div className="mt-[16px] flex flex-wrap items-center gap-[8px]">
        <Link href={href({ category: "" })} className={chip(!filters.category)}>
          {t("allCategories")}
        </Link>
        {(categories ?? []).map((c) => (
          <Link
            key={c.code}
            href={href({ category: c.code })}
            className={chip(filters.category === c.code)}
          >
            {ar ? c.name_ar : c.name_en}
          </Link>
        ))}
        <span className="h-0 basis-full" />
        <span className="flex flex-none items-center gap-[8px] whitespace-nowrap">
          <span className="text-[13px] font-medium text-text-muted">{t("availability")}</span>
          <span className="flex gap-[2px] rounded-control bg-surface-subtle p-[3px]">
            <Link href={href({ availability: "" })} className={seg(!filters.availability)}>
              {t("all")}
            </Link>
            <Link
              href={href({ availability: "available" })}
              className={seg(filters.availability === "available")}
            >
              {t("avail.availableShort")}
            </Link>
            <Link
              href={href({ availability: "confirm" })}
              className={seg(filters.availability === "confirm")}
            >
              {t("avail.confirmShort")}
            </Link>
          </span>
        </span>
        <span className="flex flex-none items-center gap-[8px] whitespace-nowrap">
          <span className="text-[13px] font-medium text-text-muted">{t("sort")}</span>
          <span className="flex gap-[2px] rounded-control bg-surface-subtle p-[3px]">
            <Link href={href({ sort: "" })} className={seg(filters.sort !== "price")}>
              {t("byName")}
            </Link>
            <Link href={href({ sort: "price" })} className={seg(filters.sort === "price")}>
              {t("byPrice")}
            </Link>
          </span>
        </span>
        <span aria-live="polite" className="ms-auto text-[14px] font-semibold whitespace-nowrap">
          {t("results", { count: products.length })}
        </span>
      </div>
      {products.length === 0 && (
        <div className="mt-[24px] grid justify-items-center gap-[8px] rounded-card border border-dashed border-border-strong px-[20px] py-[40px] text-center text-text-muted">
          <b className="text-text">{t("noRes")}</b>
          {t("noResB")}
          {store?.whatsapp && (
            <a href={waLink(store.whatsapp)} className="inline-flex min-h-[44px] items-center">
              {t("msgPh")}
            </a>
          )}
        </div>
      )}
      <div className="mt-[20px] grid grid-cols-4 gap-[16px] max-[1000px]:grid-cols-2 max-[360px]:grid-cols-1">
        {products.map((p) => (
          <ProductTile key={p.slug} product={p} />
        ))}
      </div>
    </section>
  );
}
