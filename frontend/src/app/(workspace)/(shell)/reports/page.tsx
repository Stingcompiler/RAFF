import { getLocale, getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/shell/PageHeader";
import { REPORTS, type ReportName } from "@/features/reports/names";
import { ReportsScreen } from "@/features/reports/ReportsScreen";
import { serverGet } from "@/lib/api/server";
import type { Schemas } from "@/lib/api/types";
import { requireMe } from "@/lib/session";

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const me = await requireMe();
  const t = await getTranslations("reports");
  if (!me.permissions.includes("reports.view")) return <PageHeader title={t("title")} />;
  const asked = (await searchParams).r;
  const name: ReportName = (REPORTS as readonly string[]).includes(String(asked))
    ? (asked as ReportName)
    : "gross_profit";
  const report = await serverGet<Schemas["Report"]>(`/reports/${name}/`);
  if (!report) return <PageHeader title={t("title")} />;
  const ar = (await getLocale()) === "ar";
  return (
    <ReportsScreen
      initial={report}
      name={name}
      branch={ar ? me.branch.name_ar : me.branch.name_en}
    />
  );
}
