import type { Metadata } from "next";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { RootDocument } from "@/components/RootDocument";
import { defaultLocale, isLocale, locales } from "@/lib/i18n/config";

export const dynamicParams = false;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale: isLocale(locale) ? locale : defaultLocale,
    namespace: "app",
  });
  return { title: t("name") };
}

// Product landing: locale from the URL (/ar, /en), always light.
export default async function MarketingLayout({ children, params }: LayoutProps<"/[locale]">) {
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
