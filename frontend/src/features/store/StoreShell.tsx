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
const NAV = [
  ["/", "home"],
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
export function StoreShell({ store, children }: { store: Store; children: ReactNode }) {
  const t = useTranslations("store");
  const ar = useLocale() === "ar";
  const path = usePathname();
  const lines = useCart();
  const count = lines.reduce((n, l) => n + l.qty, 0);
  // The pharmacy's colour overrides the brand token only; everything else stays on tokens.
  const brand = (store.brand_color ? { "--brand": store.brand_color } : {}) as CSSProperties;
  return (
    <div
      style={brand}
      className={cn(
        "min-h-dvh bg-canvas text-lead leading-body text-text",
        path === "/" && "max-[760px]:pb-[72px]",
      )}
    >
      <header className="sticky top-0 z-[5] flex flex-wrap items-center gap-[16px] border-b border-border bg-surface-subtle px-[20px] py-[12px]">
        <Link
          href="/"
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
          {NAV.map(([href, key]) => {
            const on = href === "/" ? path === "/" : path.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-[44px] items-center rounded-control px-[12px] font-medium whitespace-nowrap no-underline transition-[background] duration-(--motion-feedback)",
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
      </header>
      <main>{children}</main>
      {path === "/" && <StickyCta whatsapp={store.whatsapp ?? ""} />}
      <footer className="mt-[24px] grid gap-[8px] border-t border-border px-[20px] py-[24px] text-body text-text-muted">
        <div className="flex flex-wrap gap-[16px]">
          <Link href="/policies/privacy" className="hit-44 text-brand">
            {t("policy")}
          </Link>
          <Link href="/about" className="hit-44 text-brand">
            {t("nav.about")}
          </Link>
          <Link href="/contact" className="hit-44 text-brand">
            {t("nav.contact")}
          </Link>
          <Link href="/orders/track" className="hit-44 text-brand">
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
      className="flex h-[44px] min-w-[180px] flex-1 items-center gap-[8px] rounded-control border border-border-strong bg-surface px-[12px]"
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
