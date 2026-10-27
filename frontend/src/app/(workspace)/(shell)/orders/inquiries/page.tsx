import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/shell/PageHeader";
import { InquiriesScreen } from "@/features/orders/InquiriesScreen";
import type { InquiryRow } from "@/features/orders/labels";
import { serverGet } from "@/lib/api/server";
import { requireMe } from "@/lib/session";

export default async function InquiriesPage() {
  const me = await requireMe();
  if (!me.permissions.includes("orders.manage")) {
    const t = await getTranslations("orders.inq");
    return <PageHeader title={t("title")} />;
  }
  return <InquiriesScreen initial={(await serverGet<InquiryRow[]>("/inquiries/")) ?? []} />;
}
