import { cn } from "@/lib/cn";

export type ConnectionStatus = "online" | "reconnecting" | "unavailable";

const TONE = {
  online: "text-success-text bg-success-bg",
  reconnecting: "text-warning-text bg-warning-bg",
  unavailable: "text-danger-text bg-danger-bg",
} as const;

type Props = {
  status: ConnectionStatus;
  /** Server state, e.g. "Server: online". */
  label: string;
  /** Last good backup and pending operations. */
  detail?: string;
  /** `chip`: compact pill for the top bar; `bar`: full-width row. */
  variant?: "chip" | "bar";
  className?: string;
};

/** Three values: server state, last successful backup, pending operations. */
export function ConnectionIndicator({ status, label, detail, variant = "chip", className }: Props) {
  const dot = <span aria-hidden="true" className="size-[8px] rounded-full bg-current" />;
  if (variant === "chip") {
    return (
      <span
        role="status"
        className={cn(
          "flex items-center gap-[8px] rounded-full px-[10px] py-[4px] text-[12px] font-medium",
          TONE[status],
          className,
        )}
      >
        {dot}
        {detail ? `${label} · ${detail}` : label}
      </span>
    );
  }
  return (
    <div
      role="status"
      className={cn(
        "flex items-center gap-[10px] rounded-[8px] px-[12px] py-[8px] text-[13px]",
        TONE[status],
        className,
      )}
    >
      {dot}
      <span className="flex-1 font-medium">{label}</span>
      {detail && <span className="text-[12px] opacity-85">{detail}</span>}
    </div>
  );
}
