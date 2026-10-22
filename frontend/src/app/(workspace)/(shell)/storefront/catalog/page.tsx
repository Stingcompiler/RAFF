import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/shell/PageHeader";
import { CatalogScreen } from "@/features/storefront/CatalogScreen";
import { serverGet } from "@/lib/api/server";
import type { Schemas } from "@/lib/api/types";
import { requireMe } from "@/lib/session";

export default async function StorefrontCatalogPage() {
  const me = await requireMe();
  if (!me.permissions.includes("storefront.manage")) {
    const t = await getTranslations("storeAdmin");
    return <PageHeader title={t("catT")} />;
  }
  return (
    <CatalogScreen
      initial={(await serverGet<Schemas["ListingRow"][]>("/storefront/listings/")) ?? []}
    />
  );
}
