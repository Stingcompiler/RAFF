import { getLocale } from "next-intl/server";
import type { ReactNode } from "react";

import { RootDocument } from "@/components/RootDocument";
import { AppShell } from "@/components/shell/AppShell";
import { defaultLocale, isLocale } from "@/lib/i18n/config";
import { requireMe } from "@/lib/session";
import { getShellContext } from "@/lib/shell/context";
import { getTheme } from "@/lib/theme/config";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const me = await requireMe();
  const locale = await getLocale();
  return (
    <RootDocument locale={isLocale(locale) ? locale : defaultLocale} theme={await getTheme()}>
      <AppShell context={await getShellContext(me)}>{children}</AppShell>
    </RootDocument>
  );
}
