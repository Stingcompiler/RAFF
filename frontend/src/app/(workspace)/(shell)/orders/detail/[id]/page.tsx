import { getLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import type { OrderDetail } from "@/features/orders/labels";
import { OrderDetailScreen } from "@/features/orders/OrderDetailScreen";
import type { Store } from "@/features/store/types";
import { serverGet } from "@/lib/api/server";
import { requireMe } from "@/lib/session";

export default async function OrderDetailPage({ params }: PageProps<"/orders/detail/[id]">) {
  const { id } = await params;
  await requireMe();
  const [order, store] = await Promise.all([
    serverGet<OrderDetail>(`/orders/${id}/`),
    serverGet<Store>("/public/store/"),
  ]);
  if (!order) notFound();
  const ar = (await getLocale()) === "ar";
  return (
    <OrderDetailScreen initial={order} storeName={(ar ? store?.name_ar : store?.name_en) ?? ""} />
  );
}
