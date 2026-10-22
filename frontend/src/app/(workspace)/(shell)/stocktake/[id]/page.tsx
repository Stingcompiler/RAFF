import { notFound } from "next/navigation";

import { StocktakeEditor } from "@/features/stocktake/StocktakeEditor";
import type { TakeDetail } from "@/features/stocktake/labels";
import { serverGet } from "@/lib/api/server";
import { requireMe } from "@/lib/session";

export default async function StocktakeDetailPage({ params }: PageProps<"/stocktake/[id]">) {
  const { id } = await params;
  const me = await requireMe();
  const take = await serverGet<TakeDetail>(`/stocktakes/${id}/`);
  if (!take) notFound();
  return <StocktakeEditor initial={take} canCount={me.permissions.includes("stocktake.approve")} />;
}
