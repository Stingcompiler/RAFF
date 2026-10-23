import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { RootDocument } from "@/components/RootDocument";
import { defaultLocale, isLocale } from "@/lib/i18n/config";
import { getDensity } from "@/lib/density/config";
import { getTheme } from "@/lib/theme/config";

// Rendered per request so every page carries its CSP nonce (src/proxy.ts).
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app");
  return { title: t("name") };
}

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <RootDocument
      locale={isLocale(locale) ? locale : defaultLocale}
      theme={await getTheme()}
      density={await getDensity()}
    >
      {children}
    </RootDocument>
  );
}
