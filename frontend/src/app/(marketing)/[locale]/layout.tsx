import { getLocale, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { RootDocument } from "@/components/RootDocument";
import { isLocale, locales } from "@/lib/i18n/config";

export const dynamicParams = false;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

type Props = { children: ReactNode; params: Promise<{ locale: string }> };

// Product landing: locale from the URL (/ar, /en), always light.
export default async function MarketingLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const resolved = await getLocale();
  return (
    <RootDocument locale={isLocale(resolved) ? resolved : locale} theme="light">
      {children}
    </RootDocument>
  );
}
