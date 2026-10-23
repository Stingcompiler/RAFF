"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/cn";

type PhoneNavKey = "search" | "count" | "today" | "sell";

/** Raff Mobile: four destinations. Orders belongs to "today" (it opens from there). */
const ITEMS: readonly { key: PhoneNavKey; href: string; paths: readonly string[] }[] = [
  { key: "search", href: "/inventory", paths: ["/inventory"] },
  { key: "count", href: "/stocktake", paths: ["/stocktake"] },
  { key: "today", href: "/dashboard", paths: ["/dashboard", "/orders"] },
  { key: "sell", href: "/pos", paths: ["/pos"] },
];

const trim = (path: string) => (path.length > 1 ? path.replace(/\/$/, "") : path);

/** Screens that have a phone design; they replace the top bar with the status strip. */
export const PHONE_SCREEN_PATHS = ["/inventory", "/stocktake", "/dashboard", "/orders"] as const;
export const isPhoneScreen = (pathname: string) =>
  (PHONE_SCREEN_PATHS as readonly string[]).includes(trim(pathname));

/** Bottom navigation at ≤760px (68px; a pill above each label). */
export function PhoneNav({ activePath, className }: { activePath?: string; className?: string }) {
  const t = useTranslations("phone.nav");
  const current = usePathname();
  const pathname = trim(activePath ?? current);
  return (
    <nav
      aria-label={t("label")}
      className={cn(
        "grid h-[68px] flex-none grid-cols-4 border-t border-line bg-surface-raised",
        className,
      )}
    >
      {ITEMS.map((item) => {
        const active = item.paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "grid min-h-[44px] content-center place-items-center gap-[4px] text-[12px] font-medium no-underline",
              "transition-[color] duration-200",
              active ? "text-primary" : "text-muted",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "block h-[4px] rounded-[2px]",
                active ? "w-[28px] bg-primary" : "w-[18px] bg-line",
              )}
            />
            <span>{t(item.key)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
