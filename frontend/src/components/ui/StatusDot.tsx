import { cn } from "@/lib/cn";

const DOTS = {
  success: "bg-success",
  warn: "bg-warn animate-[raff-pulse_1.6s_ease-in-out_infinite]",
  danger: "bg-danger",
} as const;

export function StatusDot({ tone, className }: { tone: keyof typeof DOTS; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-[10px] rounded-full", DOTS[tone], className)}
    />
  );
}
