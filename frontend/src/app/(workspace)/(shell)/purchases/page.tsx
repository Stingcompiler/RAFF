import { ReceiptList } from "@/features/purchasing/ReceiptList";
import { serverGet } from "@/lib/api/server";
import type { Schemas } from "@/lib/api/types";
import { requireMe } from "@/lib/session";

export default async function PurchasesPage() {
  const me = await requireMe();
  const receipts = await serverGet<Schemas["ReceiptList"][]>("/purchasing/receipts/");
  return (
    <ReceiptList
      receipts={receipts ?? []}
      canReceive={me.permissions.includes("purchasing.receive")}
    />
  );
}
