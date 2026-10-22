import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/shell/PageHeader";
import { StoreSettingsScreen } from "@/features/storefront/StoreSettingsScreen";
import { serverGet } from "@/lib/api/server";
import type { Branch, Schemas } from "@/lib/api/types";
import { requireMe } from "@/lib/session";

export default async function StorefrontSettingsPage() {
  const me = await requireMe();
  const t = await getTranslations("storeAdmin");
  if (!me.permissions.includes("storefront.manage")) return <PageHeader title={t("setT")} />;
  const [settings, branches] = await Promise.all([
    serverGet<Schemas["Settings"]>("/storefront/settings/"),
    serverGet<Branch[]>("/branches/"),
  ]);
  if (!settings) return <PageHeader title={t("setT")} />;
  return <StoreSettingsScreen initial={settings} branches={branches ?? []} />;
}
