import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/shell/PageHeader";
import type { OrderRow } from "@/features/orders/labels";
import { OrdersScreen } from "@/features/orders/OrdersScreen";
import { serverGet } from "@/lib/api/server";
import { requireMe } from "@/lib/session";

export default async function OrdersPage() {
  const me = await requireMe();
  if (!me.permissions.includes("orders.manage")) {
    const t = await getTranslations("orders");
    return <PageHeader title={t("title")} />;
  }
  return <OrdersScreen initial={(await serverGet<OrderRow[]>("/orders/")) ?? []} />;
}
