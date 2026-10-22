import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/shell/PageHeader";
import { PartiesScreen } from "@/features/parties/PartiesScreen";
import { serverGet } from "@/lib/api/server";
import type { Schemas } from "@/lib/api/types";
import { requireMe } from "@/lib/session";

export default async function PartiesPage() {
  const me = await requireMe();
  if (!me.permissions.includes("finance.view")) {
    const t = await getTranslations("parties");
    return <PageHeader title={t("title")} />;
  }
  const [customers, suppliers] = await Promise.all([
    serverGet<Schemas["Party"][]>("/finance/parties/?type=customer"),
    serverGet<Schemas["Party"][]>("/finance/parties/?type=supplier"),
  ]);
  return (
    <PartiesScreen
      customers={customers ?? []}
      suppliers={suppliers ?? []}
      canPay={me.permissions.includes("finance.manage")}
    />
  );
}
