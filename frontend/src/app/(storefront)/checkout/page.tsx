import { Suspense } from "react";

import { CheckoutScreen } from "@/features/store/CheckoutScreen";
import type { Store } from "@/features/store/types";
import { serverGet } from "@/lib/api/server";

export default async function CheckoutPage() {
  const store = await serverGet<Store>("/public/store/").catch(() => null);
  return (
    <Suspense>
      <CheckoutScreen
        store={
          store ?? {
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
            prepay_enabled: false,
            bank_accounts: "",
            payment_hold_hours: 24,
            delivery_enabled: false,
          }
        }
      />
    </Suspense>
  );
}
