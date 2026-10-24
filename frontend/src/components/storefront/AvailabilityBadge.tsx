import { cn } from "@/lib/cn";

/** Exactly three public values; never a stock number. */
export type Availability = "available" | "confirm" | "unavailable";

const STYLE: Record<Availability, string> = {
  available: "text-success-text bg-success-bg",
  confirm: "text-warning-text bg-warning-bg",
  unavailable: "text-info-text bg-info-bg",
};
const SYMBOL: Record<Availability, string> = { available: "●", confirm: "▲", unavailable: "■" };

export function AvailabilityBadge({ value, label }: { value: Availability; label: string }) {
  return (
    <span
      className={cn(
        "rounded-full px-[10px] py-[3px] text-label font-semibold whitespace-nowrap",
        STYLE[value],
      )}
    >
      {SYMBOL[value]} {label}
    </span>
  );
}
