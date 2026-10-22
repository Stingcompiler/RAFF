"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { BrandMark } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

import { isActive, NAV } from "./nav";
import type { ShellContext } from "./types";

type Props = {
  context: ShellContext;
  /** Drawer state at ≤760px. */
  open: boolean;
  onNavigate: () => void;
  /** Force an active item (design previews). */
  activePath?: string;
};

/** 232px sidebar; 64px icon rail at ≤1180px; slide-in drawer at ≤760px. */
export function Sidebar({ context, open, onNavigate, activePath }: Props) {
  const t = useTranslations();
  const pathname = usePathname();
  const current = activePath ?? pathname;
  return (
    <nav
      aria-label={t("shell.navigation")}
      className={cn(
        "z-[6] flex w-[232px] flex-none flex-col gap-[4px] border-e border-line bg-sidebar px-[12px] py-[16px]",
        "max-[1180px]:w-[40px]",
        "max-[760px]:fixed max-[760px]:inset-y-0 max-[760px]:start-0 max-[760px]:w-[232px] max-[760px]:shadow-drawer",
        "max-[760px]:transition-transform max-[760px]:duration-300",
        open
          ? "max-[760px]:translate-x-0"
          : "max-[760px]:ltr:-translate-x-[110%] max-[760px]:rtl:translate-x-[110%]",
      )}
    >
      <div className="flex items-center gap-[8px] px-[8px] pt-[4px] pb-[16px] text-[18px] font-bold text-primary">
        <BrandMark className="flex-none" />
        <span className="max-[1180px]:hidden max-[760px]:inline">{t("app.name")}</span>
      </div>
      {NAV.map((item) => {
        const active = isActive(item, current);
        const badge = context.badges?.[item.key];
        const Icon = item.icon;
        return (
          <Link
            key={item.key}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            title={t(`nav.${item.key}`)}
            className={cn(
              "flex min-h-[40px] items-center gap-[12px] overflow-hidden rounded-[8px] px-[12px] font-medium text-ellipsis whitespace-nowrap text-ink no-underline",
              "transition-[background,color,transform,filter] duration-200 hover:brightness-95 active:scale-[.98]",
              "max-[1180px]:justify-center max-[1180px]:px-0 max-[760px]:justify-start max-[760px]:px-[12px]",
              active && "bg-accent font-semibold",
            )}
          >
            <Icon
              className={cn(
                "flex-none transition-[color,transform] duration-200",
                active ? "scale-[1.12] text-primary" : "text-muted",
              )}
            />
            <span className="min-w-0 flex-1 max-[1180px]:hidden max-[760px]:inline">
              {t(`nav.${item.key}`)}
            </span>
            {badge ? (
              <span className="grid h-[22px] min-w-[22px] flex-none place-items-center rounded-full bg-primary text-[12px] font-semibold text-primary-ink max-[1180px]:hidden max-[760px]:grid">
                {badge}
              </span>
            ) : null}
          </Link>
        );
      })}
      <div className="mt-auto border-t border-line p-[8px] text-[12px] text-muted max-[1180px]:hidden max-[760px]:block">
        {context.deviceLine}
      </div>
    </nav>
  );
}
