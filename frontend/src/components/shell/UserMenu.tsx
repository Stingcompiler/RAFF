"use client";

import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { apiSend } from "@/lib/api/browser";
import { cn } from "@/lib/cn";
import { DENSITY_COOKIE, densities } from "@/lib/density/cookie";
import { LOCALE_COOKIE } from "@/lib/i18n/config";
import { THEME_COOKIE } from "@/lib/theme/cookie";

import type { ShellContext } from "./types";

const AT = "@";

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
}

/** A row of mutually exclusive choices: one group label, options side by side. */
function Choice({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="grid gap-[4px] px-[8px] pt-[8px]">
      <div className="text-caption font-medium text-text-muted">{label}</div>
      <div className="flex gap-[4px] rounded-control bg-surface-subtle p-[3px]">{children}</div>
    </div>
  );
}

/**
 * The profile strip: avatar, name and role in the top bar; the menu holds who you are, the
 * language, theme and density choices (side by side, short), and your own password / sign out.
 */
export function UserMenu({ user }: { user: ShellContext["user"] }) {
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

  const option = (active: boolean) =>
    cn(
      "min-h-[34px] flex-1 cursor-pointer rounded-control border-0 px-[8px] text-center type-inherit text-label whitespace-nowrap",
      "transition-[background,color] duration-(--motion-feedback)",
      active
        ? "bg-surface font-semibold text-brand shadow-segment"
        : "bg-transparent text-text-secondary hover:text-text",
    );
  const action =
    "flex min-h-[40px] w-full cursor-pointer items-center gap-[8px] rounded-control border-0 bg-transparent px-[12px] text-start type-inherit text-body text-text hover:bg-surface-subtle";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("userMenu")}
        onClick={() => setOpen((v) => !v)}
        className="hit-44 flex cursor-pointer items-center gap-[10px] rounded-control border-0 bg-transparent px-[4px] type-inherit text-text hover:bg-surface"
      >
        <span className="grid size-[32px] flex-none place-items-center rounded-full bg-brand-subtle text-label font-semibold">
          {user.initial}
        </span>
        <span className="grid text-start leading-snug max-[760px]:hidden">
          <span className="text-label font-semibold">{user.name}</span>
          {user.role && <span className="text-caption text-text-muted">{user.role}</span>}
        </span>
        <ChevronDown size={14} aria-hidden="true" className="text-text-muted max-[760px]:hidden" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute end-0 top-[44px] z-[7] grid w-[272px] gap-[2px] rounded-card border border-border bg-surface-raised p-[6px] shadow-dialog"
        >
          <div className="flex items-center gap-[10px] px-[8px] pt-[6px] pb-[8px]">
            <span className="grid size-[40px] flex-none place-items-center rounded-full bg-brand-subtle text-lead font-semibold">
              {user.initial}
            </span>
            <span className="grid min-w-0 leading-snug">
              <span className="truncate text-body font-semibold">{user.name}</span>
              <span className="truncate text-caption text-text-muted">
                {user.role && <>{user.role} </>}
                <bdi dir="ltr" className="num">
                  {AT}
                  {user.username}
                </bdi>
              </span>
            </span>
          </div>
          <div className="border-t border-border" />
          <Choice label={t("language")}>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={locale === "ar"}
              className={option(locale === "ar")}
              onClick={() => choose(LOCALE_COOKIE, "ar")}
            >
              {t("localeAr")}
            </button>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={locale === "en"}
              className={option(locale === "en")}
              onClick={() => choose(LOCALE_COOKIE, "en")}
            >
              {t("localeEn")}
            </button>
          </Choice>
          <Choice label={t("theme")}>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={theme === "light"}
              className={option(theme === "light")}
              onClick={() => choose(THEME_COOKIE, "light")}
            >
              {t("themeLight")}
            </button>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={theme === "dark"}
              className={option(theme === "dark")}
              onClick={() => choose(THEME_COOKIE, "dark")}
            >
              {t("themeDark")}
            </button>
          </Choice>
          <Choice label={t("density")}>
            {densities.map((d) => (
              <button
                key={d}
                type="button"
                role="menuitemradio"
                aria-checked={density === d}
                className={option(density === d)}
                onClick={() => choose(DENSITY_COOKIE, d)}
              >
                {t(`density_${d}`)}
              </button>
            ))}
          </Choice>
          <div className="my-[6px] border-t border-border" />
          <button
            type="button"
            role="menuitem"
            className={action}
            onClick={() => {
              setOpen(false);
              router.push("/account/password");
            }}
          >
            {t("changePassword")}
          </button>
          <button
            type="button"
            role="menuitem"
            className={cn(action, "text-danger-text")}
            onClick={signOut}
          >
            {t("signOut")}
          </button>
        </div>
      )}
    </div>
  );
}
