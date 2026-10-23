import { cn } from "@/lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "block h-[12px] rounded-control bg-[linear-gradient(90deg,var(--color-border)_25%,var(--color-surface-subtle)_50%,var(--color-border)_75%)] bg-[length:200%_100%] animate-[raff-shimmer_1.4s_linear_infinite]",
        className,
      )}
    />
  );
}
