import { getLocale, getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/shell/PageHeader";
import { DashboardScreen } from "@/features/dashboard/DashboardScreen";
import { serverGet } from "@/lib/api/server";
import type { Schemas } from "@/lib/api/types";
import { requireMe } from "@/lib/session";

export default async function DashboardPage() {
  const me = await requireMe();
  const t = await getTranslations("dashboard");
  const overview = me.permissions.includes("reports.view")
    ? await serverGet<Schemas["Overview"]>("/dashboard/")
    : null;
  if (!overview) return <PageHeader title={t("title")} />;
  const ar = (await getLocale()) === "ar";
  return (
    <DashboardScreen
      initial={overview}
      canAll={me.branches.length > 1}
      branchName={ar ? me.branch.name_ar : me.branch.name_en}
    />
  );
}
