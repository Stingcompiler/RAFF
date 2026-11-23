"use client";

import {
  ClipboardCheck,
  LayoutDashboard,
  type LucideIcon,
  ScanBarcode,
  Search,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/cn";

type PhoneNavKey = "search" | "count" | "today" | "sell";

/** Raff Mobile: four destinations. Orders belongs to "today" (it opens from there). */
const ITEMS: readonly {
  key: PhoneNavKey;
  href: string;
  paths: readonly string[];
  icon: LucideIcon;
}[] = [
  { key: "search", href: "/inventory", paths: ["/inventory"], icon: Search },
  { key: "count", href: "/stocktake", paths: ["/stocktake"], icon: ClipboardCheck },
  { key: "today", href: "/dashboard", paths: ["/dashboard", "/orders"], icon: LayoutDashboard },
  { key: "sell", href: "/pos", paths: ["/pos"], icon: ScanBarcode },
];

const trim = (path: string) => (path.length > 1 ? path.replace(/\/$/, "") : path);

/** Screens that have a phone design; they replace the top bar with the status strip. */
export const PHONE_SCREEN_PATHS = ["/inventory", "/stocktake", "/dashboard", "/orders"] as const;
export const isPhoneScreen = (pathname: string) =>
  (PHONE_SCREEN_PATHS as readonly string[]).includes(trim(pathname));

/** Bottom navigation at ≤760px, with an icon and label for each destination. */
export function PhoneNav({ activePath, className }: { activePath?: string; className?: string }) {
  const t = useTranslations("phone.nav");
  const current = usePathname();
  const pathname = trim(activePath ?? current);
  return (
    <nav
      aria-label={t("label")}
      className={cn(
        "grid h-[68px] flex-none grid-cols-4 border-t border-border bg-surface-subtle",
        className,
      )}
    >
      {ITEMS.map(({ icon: Icon, ...item }) => {
        const active = item.paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "grid min-h-[44px] content-center place-items-center gap-[4px] text-caption font-medium no-underline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus",
              "transition-[color] duration-(--motion-feedback)",
              active ? "text-brand" : "text-text-muted",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "grid h-[28px] w-[40px] place-items-center rounded-full",
                active && "bg-brand-subtle",
              )}
            >
              <Icon size={22} />
            </span>
            <span>{t(item.key)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
