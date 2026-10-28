import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { buttonClasses } from "@/components/ui/Button";
import { ToastProvider } from "@/components/ui/Toast";
import { DeliveriesScreen } from "@/features/deliveries/DeliveriesScreen";
import type { DeliveryCard } from "@/features/deliveries/types";
import { serverGet } from "@/lib/api/server";
import { cn } from "@/lib/cn";
import { requireMe } from "@/lib/session";

/** The courier's screen: only the orders given to this user, phone first (no sidebar shell). */
export default async function DeliveriesPage() {
  const me = await requireMe();
  const t = await getTranslations("deliveries");
  const tCommon = await getTranslations("common");
  if (!me.permissions.includes("deliveries.handle")) {
    return (
      <main className="grid min-h-dvh place-content-center justify-items-center gap-[16px] bg-canvas p-[24px] text-center text-text">
        <p className="text-lead font-medium">{t("forbidden")}</p>
        <Link href="/dashboard" className={cn(buttonClasses({}), "no-underline")}>
          {t("home")}
        </Link>
      </main>
    );
  }
  const cards = (await serverGet<DeliveryCard[]>("/deliveries/")) ?? [];
  return (
    <ToastProvider dismissLabel={tCommon("dismiss")}>
      <DeliveriesScreen initial={cards} name={me.user.display_name_ar} />
    </ToastProvider>
  );
}
