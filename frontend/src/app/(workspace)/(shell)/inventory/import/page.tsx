import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { ImportScreen } from "@/features/catalog/ImportScreen";
import { requireMe } from "@/lib/session";

export default async function ImportPage() {
  const me = await requireMe();
  if (!me.permissions.includes("inventory.manage")) redirect("/inventory");
  return <ImportScreen ar={(await getLocale()) === "ar"} />;
}
