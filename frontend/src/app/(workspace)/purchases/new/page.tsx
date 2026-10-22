import { redirect } from "next/navigation";

import { ReceiptEditor } from "@/features/purchasing/ReceiptEditor";
import type { Supplier } from "@/features/purchasing/types";
import { serverGet } from "@/lib/api/server";
import { requireMe } from "@/lib/session";

export default async function NewReceiptPage() {
  const me = await requireMe();
  if (!me.permissions.includes("purchasing.receive")) redirect("/purchases");
  const suppliers = await serverGet<Supplier[]>("/suppliers/");
  return <ReceiptEditor initial={null} suppliers={suppliers ?? []} />;
}
