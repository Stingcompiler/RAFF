"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  Suspense,
  useEffect,
  useState,
} from "react";

import { SearchIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

import { useCart } from "./cart";
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

const SCROLLED_PX = 480;

/**
 * On a phone, once the hero's button has scrolled away, the page's one action stays in reach
 * with the pharmacy's channel beside it (LANDING §2: a pinned bar shows the button on scroll).
 */
function StickyCta({ whatsapp }: { whatsapp: string }) {
  const t = useTranslations("store");
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const onScroll = () => setShown(window.scrollY > SCROLLED_PX);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (!shown) return null;
  return (
    <div
      data-testid="sticky-cta"
      className="fixed inset-x-0 bottom-0 z-[5] hidden items-center gap-[12px] border-t border-border bg-surface px-[20px] py-[10px] max-[760px]:flex"
    >
      <Link
        href="/store"
        className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-card bg-brand font-semibold text-on-brand no-underline"
      >
        {t("browse")}
      </Link>
      {whatsapp && (
        <a
          href={waLink(whatsapp)}
          className="inline-flex min-h-[48px] items-center px-[8px] font-medium whitespace-nowrap text-brand underline underline-offset-4"
        >
          {t("contactUs")}
        </a>
      )}
    </div>
  );
}

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
        path === homePath && "max-[760px]:pb-[72px]",
      )}
    >
      <header className="sticky top-0 z-[5] border-b border-border bg-surface-subtle">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-[20px] gap-y-[8px] px-[20px] py-[10px]">
          <Link
            href={homePath}
            className="hit-44 flex items-center gap-[10px] text-land-lead font-bold whitespace-nowrap text-text no-underline"
          >
            <span
              aria-hidden="true"
              className="grid size-[34px] place-items-center rounded-full bg-brand text-section leading-none text-on-brand"
            >
              {PLUS}
            </span>
            {pick(ar, store) || t("storeTitle")}
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
            className="flex h-[44px] min-w-[44px] items-center gap-[8px] rounded-control border border-border-strong bg-surface px-[14px] font-semibold whitespace-nowrap text-text no-underline"
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
        {/* Phones have no room for the tabs in the first row: they scroll sideways under it. */}
        <nav
          aria-label={t("nav.menu")}
          className="hidden gap-[6px] overflow-x-auto px-[20px] pb-[10px] max-[760px]:flex [scrollbar-width:none]"
        >
          {links.map(([href, key]) => {
            const on = href === homePath ? path === homePath : path.startsWith(href);
            return (
              <Link
                key={`m-${href}`}
                href={href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-[40px] flex-none items-center rounded-pill border px-[14px] text-label font-medium whitespace-nowrap no-underline",
                  on
                    ? "border-brand bg-brand-subtle/40 text-brand"
                    : "border-border bg-surface text-text",
                )}
              >
                {t(`nav.${key}`)}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-[1200px] flex-1">{children}</main>
      {path === homePath && <StickyCta whatsapp={store.whatsapp ?? ""} />}
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
      className="flex h-[40px] min-w-[180px] max-w-[380px] flex-1 items-center gap-[8px] rounded-control border border-border-strong bg-surface px-[12px] max-[760px]:max-w-none"
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
