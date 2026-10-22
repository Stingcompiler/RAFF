import type { Tone } from "@/components/ui/Badge";
import type { Schemas } from "@/lib/api/types";

export type OrderRow = Schemas["StaffOrderRow"];
export type OrderDetail = Schemas["StaffOrder"];
export type OrderStatus = OrderRow["status"];

export const STATUS_TONE: Record<OrderStatus, Tone> = {
  new: "info",
  needs_contact: "warn",
  confirmed: "success",
  preparing: "info",
  ready: "success",
  out_for_delivery: "info",
  completed: "success",
  cancelled: "danger",
};

export const STATUSES: OrderStatus[] = [
  "new",
  "needs_contact",
  "confirmed",
  "preparing",
  "ready",
  "completed",
  "cancelled",
];
