import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { RootDocument } from "@/components/RootDocument";
import { ToastProvider } from "@/components/ui/Toast";
import { StoreShell } from "@/features/store/StoreShell";
import type { Store } from "@/features/store/types";
import { serverGet } from "@/lib/api/server";
import { defaultLocale, isLocale } from "@/lib/i18n/config";
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

export default async function StorefrontLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const store = (await serverGet<Store>("/public/store/").catch(() => null)) ?? FALLBACK;
  const t = await getTranslations("common");
  return (
    <RootDocument locale={isLocale(locale) ? locale : defaultLocale} theme={await getTheme()}>
      <ToastProvider dismissLabel={t("dismiss")}>
        <StoreShell store={store}>{children}</StoreShell>
      </ToastProvider>
    </RootDocument>
  );
}
