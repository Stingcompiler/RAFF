import { cn } from "@/lib/cn";

/** Exactly three public values; never a stock number. */
export type Availability = "available" | "confirm" | "unavailable";

const STYLE: Record<Availability, string> = {
  available: "text-success bg-success-bg",
  confirm: "text-warn bg-warn-bg",
  unavailable: "text-info bg-info-bg",
};
const SYMBOL: Record<Availability, string> = { available: "●", confirm: "▲", unavailable: "■" };

export function AvailabilityBadge({ value, label }: { value: Availability; label: string }) {
  return (
    <span
      className={cn(
        "rounded-full px-[10px] py-[3px] text-[13px] font-semibold whitespace-nowrap",
        STYLE[value],
      )}
    >
      {SYMBOL[value]} {label}
    </span>
  );
}
