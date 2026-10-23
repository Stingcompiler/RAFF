"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { apiSend } from "@/lib/api/browser";
import { cn } from "@/lib/cn";
import { DENSITY_COOKIE, densities } from "@/lib/density/cookie";
import { LOCALE_COOKIE } from "@/lib/i18n/config";
import { THEME_COOKIE } from "@/lib/theme/cookie";

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
}

/** Avatar + name; the menu holds the locale and theme toggles (not the top bar). */
export function UserMenu({ name, initial }: { name: string; initial: string }) {
  const t = useTranslations("shell");
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const theme =
    typeof document === "undefined" ? "light" : (document.documentElement.dataset.theme ?? "light");
  // Without a choice the device follows the screen: comfortable on a phone, default elsewhere.
  const density =
    typeof document === "undefined"
      ? "default"
      : (document.documentElement.dataset.density ??
        (window.matchMedia("(max-width: 760px)").matches ? "comfortable" : "default"));

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const signOut = async () => {
    setOpen(false);
    await apiSend("POST", "/auth/logout/");
    router.push("/login");
    router.refresh();
  };

  const choose = (cookie: string, value: string) => {
    setCookie(cookie, value);
    setOpen(false);
    router.refresh();
  };

  const item = (active: boolean) =>
    cn(
      "flex min-h-[40px] w-full cursor-pointer items-center justify-between gap-[12px] rounded-control border-0 bg-transparent px-[12px] text-start type-inherit text-text hover:bg-surface-subtle",
      active && "font-semibold text-brand",
    );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("userMenu")}
        onClick={() => setOpen((v) => !v)}
        className="flex cursor-pointer items-center gap-[8px] border-0 bg-transparent p-0 type-inherit font-medium text-text"
      >
        <span className="grid size-[28px] place-items-center rounded-full bg-brand-subtle text-[12px]">
          {initial}
        </span>
        <span className="max-[760px]:hidden">{name}</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute end-0 top-[40px] z-[7] grid w-[220px] gap-[2px] rounded-card border border-border bg-surface-raised p-[6px] shadow-dialog"
        >
          <div className="px-[12px] pt-[6px] pb-[2px] text-[12px] font-medium text-text-muted">
            {t("language")}
          </div>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={locale === "ar"}
            className={item(locale === "ar")}
            onClick={() => choose(LOCALE_COOKIE, "ar")}
          >
            {t("localeAr")}
          </button>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={locale === "en"}
            className={item(locale === "en")}
            onClick={() => choose(LOCALE_COOKIE, "en")}
          >
            {t("localeEn")}
          </button>
          <div className="px-[12px] pt-[8px] pb-[2px] text-[12px] font-medium text-text-muted">
            {t("theme")}
          </div>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={theme === "light"}
            className={item(theme === "light")}
            onClick={() => choose(THEME_COOKIE, "light")}
          >
            {t("themeLight")}
          </button>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={theme === "dark"}
            className={item(theme === "dark")}
            onClick={() => choose(THEME_COOKIE, "dark")}
          >
            {t("themeDark")}
          </button>
          <div className="px-[12px] pt-[8px] pb-[2px] text-[12px] font-medium text-text-muted">
            {t("density")}
          </div>
          {densities.map((d) => (
            <button
              key={d}
              type="button"
              role="menuitemradio"
              aria-checked={density === d}
              className={item(density === d)}
              onClick={() => choose(DENSITY_COOKIE, d)}
            >
              {t(`density_${d}`)}
            </button>
          ))}
          <div className="my-[4px] border-t border-border" />
          <button type="button" role="menuitem" className={item(false)} onClick={signOut}>
            {t("signOut")}
          </button>
        </div>
      )}
    </div>
  );
}
