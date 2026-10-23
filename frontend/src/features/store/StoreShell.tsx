"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { type CSSProperties, type FormEvent, type ReactNode, Suspense, useState } from "react";

import { SearchIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

import { useCart } from "./cart";
import { pick, type Store } from "./types";

const PLUS = "+";
const NAV = [
  ["/", "home"],
  ["/store", "store"],
  ["/about", "about"],
  ["/contact", "contact"],
  ["/orders/track", "track"],
] as const;

/** Public storefront frame: the pharmacy's brand, never Raff's (STOREFRONT-DESIGN-CHANGES §2). */
export function StoreShell({ store, children }: { store: Store; children: ReactNode }) {
  const t = useTranslations("store");
  const ar = useLocale() === "ar";
  const path = usePathname();
  const lines = useCart();
  const count = lines.reduce((n, l) => n + l.qty, 0);
  // The pharmacy's colour overrides the brand token only; everything else stays on tokens.
  const brand = (store.brand_color ? { "--brand": store.brand_color } : {}) as CSSProperties;
  return (
    <div style={brand} className="min-h-dvh bg-canvas text-[16px] leading-[1.5] text-text">
      <header className="sticky top-0 z-[5] flex flex-wrap items-center gap-[16px] border-b border-border bg-surface-subtle px-[20px] py-[12px]">
        <Link
          href="/"
          className="flex items-center gap-[10px] text-[19px] font-bold whitespace-nowrap text-text no-underline"
        >
          <span
            aria-hidden="true"
            className="grid size-[34px] place-items-center rounded-full bg-brand text-[20px] leading-none text-on-brand"
          >
            {PLUS}
          </span>
          {pick(ar, store) || t("storeTitle")}
        </Link>
        <nav aria-label={t("nav.menu")} className="flex gap-[4px] max-[760px]:hidden">
          {NAV.map(([href, key]) => {
            const on = href === "/" ? path === "/" : path.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-[40px] items-center rounded-[8px] px-[12px] font-medium whitespace-nowrap no-underline transition-[background] duration-200",
                  on ? "bg-brand-subtle/40 text-brand" : "text-text hover:bg-surface-subtle",
                )}
              >
                {t(`nav.${key}`)}
              </Link>
            );
          })}
        </nav>
        <Suspense>
          <SearchBox />
        </Suspense>
        <Link
          href="/cart"
          aria-label={t("cartCount", { count })}
          className="flex h-[44px] min-w-[44px] items-center gap-[8px] rounded-[10px] border border-border-strong bg-surface px-[14px] font-semibold whitespace-nowrap text-text no-underline"
        >
          {t("cart")}
          <span
            data-testid="cart-count"
            className="grid h-[22px] min-w-[22px] place-items-center rounded-full bg-brand-subtle px-[4px] text-[12px] text-text"
          >
            {count}
          </span>
        </Link>
      </header>
      <main>{children}</main>
      <footer className="mt-[24px] grid gap-[8px] border-t border-border px-[20px] py-[24px] text-[14px] text-text-muted">
        <div className="flex flex-wrap gap-[16px]">
          <Link href="/policies/privacy" className="text-brand">
            {t("policy")}
          </Link>
          <Link href="/about" className="text-brand">
            {t("nav.about")}
          </Link>
          <Link href="/contact" className="text-brand">
            {t("nav.contact")}
          </Link>
          <Link href="/orders/track" className="text-brand">
            {t("nav.track")}
          </Link>
        </div>
        <div>
          {[pick(ar, { name_ar: store.address_ar, name_en: store.address_en }), store.hours]
            .filter(Boolean)
            .join(" · ")}
        </div>
        <div>{t("footNote")}</div>
      </footer>
    </div>
  );
}

function SearchBox() {
  const t = useTranslations("store");
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    router.push(q.trim() ? `/store?q=${encodeURIComponent(q.trim())}` : "/store");
  };
  return (
    <form
      role="search"
      onSubmit={submit}
      className="flex h-[44px] min-w-[180px] flex-1 items-center gap-[8px] rounded-[10px] border border-border-strong bg-surface px-[12px]"
    >
      <SearchIcon className="text-text-muted" />
      <input
        type="search"
        aria-label={t("searchPh")}
        placeholder={t("searchPh")}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="min-w-0 flex-1 border-0 bg-transparent text-[16px] text-text outline-none"
      />
    </form>
  );
}
