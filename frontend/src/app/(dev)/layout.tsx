import { getLocale } from "next-intl/server";
import type { ReactNode } from "react";

import { RootDocument } from "@/components/RootDocument";
import { assertDevRoutes } from "@/lib/dev";
import { defaultLocale, isLocale } from "@/lib/i18n/config";
import { getTheme } from "@/lib/theme/config";

export const dynamic = "force-dynamic";

export default async function DevLayout({ children }: { children: ReactNode }) {
  assertDevRoutes();
  const locale = await getLocale();
  return (
    <RootDocument locale={isLocale(locale) ? locale : defaultLocale} theme={await getTheme()}>
      {children}
    </RootDocument>
  );
}
