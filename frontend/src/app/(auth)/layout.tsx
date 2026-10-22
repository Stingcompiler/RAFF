import { getLocale } from "next-intl/server";
import type { ReactNode } from "react";

import { RootDocument } from "@/components/RootDocument";
import { defaultLocale, isLocale } from "@/lib/i18n/config";
import { getTheme } from "@/lib/theme/config";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <RootDocument locale={isLocale(locale) ? locale : defaultLocale} theme={await getTheme()}>
      {children}
    </RootDocument>
  );
}
