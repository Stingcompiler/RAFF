import { getTranslations } from "next-intl/server";

import { AppShell } from "@/components/shell/AppShell";

/** The workspace shell with the design's sample data (Raff Screens). */
export default async function ShellPreview({
  searchParams,
}: {
  searchParams: Promise<{ path?: string }>;
}) {
  const t = await getTranslations("dev.shell");
  const { path = "/dashboard" } = await searchParams;
  return (
    <AppShell
      activePath={path}
      context={{
        branchLine: t("branchLine"),
        connection: { status: "online", text: t("conn") },
        user: { name: t("user"), role: t("role"), username: "mazin", initial: t("initial") },
        deviceLine: t("device"),
        badges: { orders: 1 },
      }}
    >
      <span />
    </AppShell>
  );
}
