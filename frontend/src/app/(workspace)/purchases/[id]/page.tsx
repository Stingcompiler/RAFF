import { notFound } from "next/navigation";

import { ReceiptEditor } from "@/features/purchasing/ReceiptEditor";
import type { Receipt, Supplier } from "@/features/purchasing/types";
import { serverGet } from "@/lib/api/server";
import { requireMe } from "@/lib/session";

export default async function ReceiptPage({ params }: PageProps<"/purchases/[id]">) {
  await requireMe();
  const { id } = await params;
  const [receipt, suppliers] = await Promise.all([
    serverGet<Receipt>(`/purchasing/receipts/${id}/`),
    serverGet<Supplier[]>("/suppliers/"),
  ]);
  if (!receipt) notFound();
  return <ReceiptEditor key={receipt.id} initial={receipt} suppliers={suppliers ?? []} />;
}
