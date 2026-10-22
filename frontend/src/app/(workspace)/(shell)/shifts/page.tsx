import { ShiftsScreen } from "@/features/shifts/ShiftsScreen";
import { serverGet } from "@/lib/api/server";
import type { Schemas } from "@/lib/api/types";
import { requireMe } from "@/lib/session";

export default async function ShiftsPage() {
  const me = await requireMe();
  const canShifts = me.permissions.includes("shifts.manage");
  const canFinance = me.permissions.includes("finance.view");
  const [current, log, transfers] = await Promise.all([
    canShifts && me.device ? serverGet<Schemas["ShiftSummary"]>("/shifts/current/") : null,
    canShifts ? serverGet<Schemas["ShiftLog"][]>("/shifts/history/") : null,
    canFinance ? serverGet<Schemas["BankTransfer"][]>("/finance/bank-transfers/") : null,
  ]);
  return (
    <ShiftsScreen
      current={current}
      log={log ?? []}
      transfers={transfers ?? []}
      canClose={canShifts && Boolean(me.device)}
      canFinance={me.permissions.includes("finance.manage")}
    />
  );
}
