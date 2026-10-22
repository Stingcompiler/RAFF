import { StocktakeList } from "@/features/stocktake/StocktakeList";
import type { Take } from "@/features/stocktake/labels";
import { serverGet } from "@/lib/api/server";
import type { Schemas } from "@/lib/api/types";
import { requireMe } from "@/lib/session";

export default async function StocktakePage() {
  const me = await requireMe();
  const [takes, categories] = await Promise.all([
    serverGet<Take[]>("/stocktakes/"),
    serverGet<Schemas["Category"][]>("/catalog/categories/"),
  ]);
  return (
    <StocktakeList
      takes={takes ?? []}
      categories={categories ?? []}
      canCount={me.permissions.includes("stocktake.approve")}
    />
  );
}
