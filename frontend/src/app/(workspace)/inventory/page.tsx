import { InventoryScreen } from "@/features/catalog/InventoryScreen";
import type { StockRow } from "@/features/catalog/labels";
import { serverGet } from "@/lib/api/server";
import type { Schemas } from "@/lib/api/types";
import { requireMe } from "@/lib/session";

export default async function InventoryPage() {
  const me = await requireMe();
  const [page, categories] = await Promise.all([
    serverGet<{ count: number; next: string | null; results: StockRow[] }>(
      "/inventory/items/?limit=50",
    ),
    serverGet<Schemas["Category"][]>("/catalog/categories/"),
  ]);
  return (
    <InventoryScreen
      initial={page ?? { count: 0, next: null, results: [] }}
      categories={categories ?? []}
      canManage={me.permissions.includes("inventory.manage")}
      canReceive={me.permissions.includes("purchasing.receive")}
    />
  );
}
