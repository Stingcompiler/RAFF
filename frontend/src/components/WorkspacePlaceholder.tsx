import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/shell/PageHeader";
import type { NavKey } from "@/components/shell/nav";

/** A workspace screen whose work order has not landed yet. */
export async function WorkspacePlaceholder({ screen }: { screen: NavKey }) {
  const t = await getTranslations();
  return (
    <>
      <PageHeader title={t(`nav.${screen}`)} />
      <p className="m-0 text-muted">{t("placeholder.body")}</p>
    </>
  );
}
