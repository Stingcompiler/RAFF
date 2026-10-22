import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/shell/PageHeader";
import { TransfersScreen } from "@/features/transfers/TransfersScreen";
import { serverGet } from "@/lib/api/server";
import type { Branch, Schemas } from "@/lib/api/types";
import { requireMe } from "@/lib/session";

export default async function TransfersPage() {
  const me = await requireMe();
  if (!me.permissions.includes("transfers.manage")) {
    const t = await getTranslations("transfers");
    return <PageHeader title={t("title")} />;
  }
  const [list, branches] = await Promise.all([
    serverGet<Schemas["Transfer"][]>("/transfers/"),
    serverGet<Branch[]>("/branches/"),
  ]);
  return <TransfersScreen initial={list ?? []} branchId={me.branch.id} branches={branches ?? []} />;
}
