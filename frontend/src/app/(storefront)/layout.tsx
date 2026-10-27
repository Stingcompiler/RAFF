import type { Metadata, Viewport } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { RootDocument } from "@/components/RootDocument";
import { ToastProvider } from "@/components/ui/Toast";
import { RegisterServiceWorker } from "@/features/store/StoreApp";
import { StoreShell } from "@/features/store/StoreShell";
import type { Store } from "@/features/store/types";
import { serverGet } from "@/lib/api/server";
import { defaultLocale, isLocale } from "@/lib/i18n/config";
import { shopHome } from "@/lib/root";
import { getTheme } from "@/lib/theme/config";

export const dynamic = "force-dynamic";

const FALLBACK: Store = {
  enabled: false,
  name_ar: "",
  name_en: "",
  brand_color: "",
  hero_title_ar: "",
  hero_title_en: "",
  hero_lead_ar: "",
  hero_lead_en: "",
  address_ar: "",
  address_en: "",
  hours: "",
  whatsapp: "",
  about_ar: "",
  about_en: "",
};

const loadStore = async () =>
  (await serverGet<Store>("/public/store/").catch(() => null)) ?? FALLBACK;

export async function generateMetadata(): Promise<Metadata> {
  const [locale, store, t] = await Promise.all([getLocale(), loadStore(), getTranslations("app")]);
  const title = (locale === "ar" ? store.name_ar : store.name_en) || t("name");
  return {
    title,
    manifest: "/manifest.webmanifest",
    icons: { apple: "/pwa/apple-touch-icon.png" },
    appleWebApp: { capable: true, title, statusBarStyle: "default" },
  };
}

export const viewport: Viewport = { viewportFit: "cover" };

export default async function StorefrontLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const store = await loadStore();
  const t = await getTranslations("common");
  return (
    <RootDocument locale={isLocale(locale) ? locale : defaultLocale} theme={await getTheme()}>
      <ToastProvider dismissLabel={t("dismiss")}>
        <StoreShell store={store} homePath={shopHome()}>
          {children}
        </StoreShell>
        <RegisterServiceWorker />
      </ToastProvider>
    </RootDocument>
  );
}
