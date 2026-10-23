import { cn } from "@/lib/cn";

const DOTS = {
  success: "bg-success-solid",
  warn: "bg-warning-solid animate-[raff-pulse_1.6s_ease-in-out_infinite]",
  danger: "bg-danger-solid",
} as const;

export function StatusDot({ tone, className }: { tone: keyof typeof DOTS; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-[10px] rounded-full", DOTS[tone], className)}
    />
  );
}
