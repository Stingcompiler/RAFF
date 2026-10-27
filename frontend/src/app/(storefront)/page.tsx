import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { StorefrontHome } from "@/features/store/StorefrontHome";
import { rootIsMarketing } from "@/lib/root";

/**
 * The domain's front door. A pharmacy's own server opens its shop here; the Raff demo
 * domain (RAFF_ROOT=marketing) opens the product page instead and keeps the shop at /shop.
 */
export default async function Root() {
  if (rootIsMarketing()) redirect(`/${await getLocale()}`);
  return <StorefrontHome />;
}
