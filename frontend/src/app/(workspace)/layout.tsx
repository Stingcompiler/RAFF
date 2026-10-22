import { getLocale } from "next-intl/server";
import type { ReactNode } from "react";

import { RootDocument } from "@/components/RootDocument";
import { defaultLocale, isLocale } from "@/lib/i18n/config";
import { requireMe } from "@/lib/session";
import { getTheme } from "@/lib/theme/config";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  await requireMe();
  const locale = await getLocale();
  return (
    <RootDocument locale={isLocale(locale) ? locale : defaultLocale} theme={await getTheme()}>
      {children}
    </RootDocument>
  );
}
