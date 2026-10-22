import type { ComponentType, SVGProps } from "react";

import {
  DashboardIcon,
  InventoryIcon,
  OrdersIcon,
  PartiesIcon,
  PurchasesIcon,
  ReportsIcon,
  ReturnsIcon,
  SettingsIcon,
  ShiftsIcon,
  StocktakeIcon,
  TransfersIcon,
} from "@/components/ui/icons";

export type NavKey =
  | "dashboard"
  | "orders"
  | "inventory"
  | "purchases"
  | "returns"
  | "stocktake"
  | "shifts"
  | "parties"
  | "transfers"
  | "reports"
  | "settings";

export type NavItem = {
  key: NavKey;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
  /** Other path prefixes that keep this item active. */
  also?: readonly string[];
};

/** Sidebar order follows Raff Screens. */
export const NAV: readonly NavItem[] = [
  { key: "dashboard", href: "/dashboard", icon: DashboardIcon },
  { key: "orders", href: "/orders", icon: OrdersIcon },
  { key: "inventory", href: "/inventory", icon: InventoryIcon },
  { key: "purchases", href: "/purchases", icon: PurchasesIcon },
  { key: "returns", href: "/returns", icon: ReturnsIcon },
  { key: "stocktake", href: "/stocktake", icon: StocktakeIcon },
  { key: "shifts", href: "/shifts", icon: ShiftsIcon },
  { key: "parties", href: "/parties", icon: PartiesIcon },
  { key: "transfers", href: "/transfers", icon: TransfersIcon },
  { key: "reports", href: "/reports", icon: ReportsIcon },
  { key: "settings", href: "/settings", icon: SettingsIcon, also: ["/storefront"] },
];

export function isActive(item: NavItem, pathname: string) {
  const match = (p: string) => pathname === p || pathname.startsWith(`${p}/`);
  return match(item.href) || (item.also ?? []).some(match);
}
