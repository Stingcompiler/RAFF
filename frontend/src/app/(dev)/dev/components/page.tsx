import { getTranslations } from "next-intl/server";

import type { ReceiptData } from "@/components/ui/ReceiptPreview";
import type { Locale } from "@/lib/i18n/config";

import { Gallery } from "./Gallery";

async function sampleReceipt(locale: Locale): Promise<ReceiptData> {
  const t = await getTranslations({ locale, namespace: "dev.receipt" });
  return {
    locale,
    shop: t("shop"),
    branch: t("branch"),
    number: t("no"),
    issuedAt: "2026-10-21 14:32",
    lines: [
      { name: t("l1"), total: "12,500" },
      { name: t("l2"), total: "4,000" },
      { name: t("l3"), total: "1,800" },
    ],
    totalLabel: t("total"),
    total: t("totalV"),
    payments: [
      { label: t("cash"), amount: t("paid") },
      { label: t("change"), amount: t("changeV") },
    ],
    footer: t("foot"),
  };
}

/** Every design-system component in every state, both themes (Raff Components). */
export default async function ComponentsPage() {
  return <Gallery receipts={[await sampleReceipt("ar"), await sampleReceipt("en")]} />;
}
