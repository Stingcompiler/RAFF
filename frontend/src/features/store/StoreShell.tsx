"use client";

import {
  House,
  MessageCircle,
  PackageSearch,
  ShoppingCart,
  Store as StoreFront,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { type CSSProperties, type FormEvent, type ReactNode, Suspense, useState } from "react";

import { SearchIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

import { useCart } from "./cart";
import { InstallButton } from "./StoreApp";
import { pick, type Store, waLink } from "./types";

const PLUS = "+";
/** The shop's pages; "home" is `homePath` ("/", or "/shop" when "/" is the product page). */
const NAV = [
  ["home", "home"],
  ["/store", "store"],
  ["/about", "about"],
  ["/contact", "contact"],
  ["/orders/track", "track"],
] as const;

const ICONS = {
  home: House,
  store: StoreFront,
  contact: MessageCircle,
  track: PackageSearch,
} as const;
/** The phone's bottom bar: the pages a customer uses most, with the cart in the middle. */
const TABS = ["home", "store", "cart", "track", "contact"] as const;

/** Public storefront frame: the pharmacy's brand, never Raff's (STOREFRONT-DESIGN-CHANGES §2). */
export function StoreShell({
  store,
  homePath,
  children,
}: {
  store: Store;
  homePath: string;
  children: ReactNode;
}) {
  const t = useTranslations("store");
  const ar = useLocale() === "ar";
  const path = usePathname();
  const lines = useCart();
  const count = lines.reduce((n, l) => n + l.qty, 0);
  // The pharmacy's colour overrides the brand token only; everything else stays on tokens.
  const links = NAV.map(([href, key]) => [href === "home" ? homePath : href, key] as const);
  const brand = (store.brand_color ? { "--brand": store.brand_color } : {}) as CSSProperties;
  return (
    <div
      style={brand}
      className={cn(
        "flex min-h-dvh flex-col bg-canvas text-body leading-body text-text",
        "max-[760px]:pb-[calc(64px+env(safe-area-inset-bottom))]",
      )}
    >
      <header className="sticky top-0 z-[5] border-b border-border bg-surface-subtle">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-[20px] gap-y-[8px] px-[20px] py-[10px] max-[760px]:flex-nowrap max-[760px]:gap-x-[10px] max-[760px]:px-[12px]">
          <Link
            href={homePath}
            className="hit-44 flex items-center gap-[10px] text-land-lead font-bold whitespace-nowrap text-text no-underline max-[760px]:max-w-[42%] max-[760px]:flex-none max-[760px]:text-lead"
          >
            <span
              aria-hidden="true"
              className="grid size-[34px] flex-none place-items-center rounded-full bg-brand text-section leading-none text-on-brand"
            >
              {PLUS}
            </span>
            <span className="min-w-0 truncate">{pick(ar, store) || t("storeTitle")}</span>
          </Link>
          <nav aria-label={t("nav.menu")} className="flex gap-[4px] max-[760px]:hidden">
            {links.map(([href, key]) => {
              const on = href === homePath ? path === homePath : path.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-[44px] items-center rounded-control px-[12px] text-body font-medium whitespace-nowrap no-underline transition-[background] duration-(--motion-feedback)",
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
            className="flex h-[44px] min-w-[44px] items-center gap-[8px] rounded-control border border-border-strong bg-surface px-[14px] font-semibold whitespace-nowrap text-text no-underline max-[760px]:hidden"
          >
            {t("cart")}
            <span
              data-testid="cart-count"
              className="num grid h-[22px] min-w-[22px] place-items-center rounded-full bg-brand-subtle px-[4px] text-caption text-text"
            >
              {count}
            </span>
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1200px] flex-1">{children}</main>
      <footer className="mt-[40px] border-t border-border bg-surface-subtle">
        <div className="mx-auto grid max-w-[1200px] gap-[28px] px-[20px] pt-[32px] pb-[20px] text-body text-text-secondary [grid-template-columns:minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] max-[900px]:[grid-template-columns:repeat(2,minmax(0,1fr))] max-[520px]:[grid-template-columns:minmax(0,1fr)]">
          <div className="grid content-start gap-[10px] max-[900px]:col-span-2 max-[520px]:col-span-1">
            <Link
              href={homePath}
              className="flex items-center gap-[10px] text-land-lead font-bold text-text no-underline"
            >
              <span
                aria-hidden="true"
                className="grid size-[30px] place-items-center rounded-full bg-brand text-section leading-none text-on-brand"
              >
                {PLUS}
              </span>
              {pick(ar, store) || t("storeTitle")}
            </Link>
            <p className="m-0 max-w-[340px]">{t("footPromise")}</p>
          </div>
          <nav aria-label={t("footPages")} className="grid content-start gap-[2px]">
            <h2 className="m-0 mb-[6px] text-label font-semibold text-text">{t("footPages")}</h2>
            {links
              .filter(([href]) => href !== homePath)
              .map(([href, key]) => (
                <Link
                  key={href}
                  href={href}
                  className="inline-flex min-h-[32px] items-center text-text-secondary no-underline hover:text-brand"
                >
                  {t(`nav.${key}`)}
                </Link>
              ))}
          </nav>
          <div className="grid content-start gap-[6px]">
            <h2 className="m-0 mb-[6px] text-label font-semibold text-text">{t("footContact")}</h2>
            {(store.address_ar || store.address_en) && (
              <div>{pick(ar, { name_ar: store.address_ar, name_en: store.address_en })}</div>
            )}
            {store.hours && (
              <div className="flex flex-wrap gap-x-[8px]">
                <span className="text-text-muted">{t("hoursL")}</span>
                <bdi className="num">{store.hours}</bdi>
              </div>
            )}
            {store.whatsapp && (
              <a
                href={waLink(store.whatsapp)}
                className="inline-flex min-h-[32px] items-center font-medium text-brand underline underline-offset-4"
              >
                {t("waLong")}
              </a>
            )}
            <InstallButton />
          </div>
          <div className="grid content-start gap-[2px]">
            <h2 className="m-0 mb-[6px] text-label font-semibold text-text">{t("footLegal")}</h2>
            <Link
              href="/policies/privacy"
              className="inline-flex min-h-[32px] items-center text-text-secondary no-underline hover:text-brand"
            >
              {t("policy")}
            </Link>
          </div>
        </div>
        <div className="border-t border-border">
          <div className="mx-auto max-w-[1200px] px-[20px] py-[12px] text-caption text-text-muted">
            {t("footNote")}
          </div>
        </div>
      </footer>
      <nav
        aria-label={t("nav.tabs")}
        data-testid="tab-bar"
        className="fixed inset-x-0 bottom-0 z-[6] hidden grid-cols-5 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] max-[760px]:grid"
      >
        {TABS.map((tab) => {
          const href =
            tab === "home"
              ? homePath
              : tab === "cart"
                ? "/cart"
                : links.find(([, k]) => k === tab)![0];
          const on = href === homePath ? path === homePath : path.startsWith(href);
          const Icon = tab === "cart" ? ShoppingCart : ICONS[tab];
          return (
            <Link
              key={tab}
              href={href}
              aria-current={on ? "page" : undefined}
              className={cn(
                "relative flex min-h-[56px] flex-col items-center justify-center gap-[2px] px-[2px] text-caption font-medium no-underline",
                on ? "text-brand" : "text-text-secondary",
              )}
            >
              <Icon size={22} aria-hidden="true" />
              {t(`nav.${tab === "cart" ? "cart" : tab}`)}
              {tab === "cart" && count > 0 && (
                <span
                  aria-label={t("cartCount", { count })}
                  className="num absolute top-[4px] ms-[18px] grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand px-[4px] text-caption text-on-brand"
                >
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
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
      className="flex h-[40px] min-w-[180px] max-w-[380px] flex-1 items-center gap-[8px] rounded-control border border-border-strong bg-surface px-[12px] max-[760px]:min-w-0 max-[760px]:max-w-none"
    >
      <SearchIcon className="text-text-muted" />
      <input
        type="search"
        aria-label={t("searchPh")}
        placeholder={t("searchPh")}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="min-w-0 flex-1 border-0 bg-transparent text-lead text-text outline-none"
      />
    </form>
  );
}
