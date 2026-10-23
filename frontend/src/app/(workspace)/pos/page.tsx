import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { buttonClasses } from "@/components/ui/Button";
import { ToastProvider } from "@/components/ui/Toast";
import { PosScreen } from "@/features/pos/PosScreen";
import type { FromOrder, PosItem, ShiftSummary } from "@/features/pos/types";
import type { Schemas } from "@/lib/api/types";

type PosOrder = Schemas["PosOrder"];
import { serverGet } from "@/lib/api/server";
import { cn } from "@/lib/cn";
import { requireMe } from "@/lib/session";

const NO_SHIFT: ShiftSummary = {
  shift: null,
  sales_total: null,
  sales_count: null,
  cash: null,
  bank: null,
  credit: null,
  expected_cash: null,
};

/** Full-screen point of sale (no sidebar shell). Needs a counter chosen for this session. */
export default async function PosPage({ searchParams }: PageProps<"/pos">) {
  const me = await requireMe();
  const t = await getTranslations("pos");
  const tCommon = await getTranslations("common");
  const ar = (await getLocale()) === "ar";
  const pick = (o: { name_ar: string; name_en: string }) => (ar ? o.name_ar : o.name_en);

  if (!me.device || !me.permissions.includes("pos.sell")) {
    return (
      <main className="grid min-h-dvh place-content-center justify-items-center gap-[16px] bg-canvas p-[24px] text-center text-text">
        <p className="text-[16px] font-medium">{t("noCounter")}</p>
        <Link href="/login?step=context" className={cn(buttonClasses({}), "no-underline")}>
          {t("chooseCounter")}
        </Link>
      </main>
    );
  }

  const orderId = (await searchParams).order;
  const [items, shift, fromOrder] = await Promise.all([
    serverGet<PosItem[]>("/pos/items/?q="),
    serverGet<ShiftSummary>("/shifts/current/"),
    typeof orderId === "string" && /^[0-9a-f-]{36}$/.test(orderId)
      ? serverGet<PosOrder>(`/orders/${orderId}/pos/`).catch(() => null)
      : null,
  ]);
  const name = ar ? me.user.display_name_ar : me.user.display_name_en;
  return (
    <ToastProvider dismissLabel={tCommon("dismiss")}>
      <PosScreen
        deviceId={me.device.id}
        branchName={pick(me.branch)}
        counterName={pick(me.device)}
        user={{ name: me.role ? `${name} (${pick(me.role)})` : name, initial: name.slice(0, 1) }}
        canDiscount={me.permissions.includes("pos.discount")}
        canOpenShift={me.permissions.includes("shifts.manage")}
        initialItems={items ?? []}
        initialShift={shift ?? NO_SHIFT}
        fromOrder={
          fromOrder ? { ...fromOrder.order, lines: fromOrder.lines as FromOrder["lines"] } : null
        }
      />
    </ToastProvider>
  );
}
