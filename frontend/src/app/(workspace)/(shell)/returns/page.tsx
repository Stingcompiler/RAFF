import { ReturnsScreen } from "@/features/returns/ReturnsScreen";
import type { QuarantineRow, ReturnRow } from "@/features/returns/types";
import { serverGet } from "@/lib/api/server";
import { requireMe } from "@/lib/session";

export default async function ReturnsPage() {
  const me = await requireMe();
  const canReturn = me.permissions.includes("returns.create");
  const [returns, quarantine] = await Promise.all([
    canReturn ? serverGet<ReturnRow[]>("/returns/") : null,
    serverGet<QuarantineRow[]>("/quarantine/"),
  ]);
  return (
    <ReturnsScreen
      initialReturns={returns ?? []}
      initialQuarantine={quarantine ?? []}
      canReturn={canReturn}
      canDecide={me.permissions.includes("quarantine.decide")}
    />
  );
}
