import { cn } from "@/lib/cn";

/** A key inside a frame, e.g. F2. Always LTR. */
export function KeyboardHint({ value, className }: { value: string; className?: string }) {
  return (
    <kbd
      dir="ltr"
      className={cn(
        "rounded-[5px] border border-b-2 border-line bg-surface-raised px-[6px] font-latin text-[12px] leading-[normal] font-medium text-ink",
        className,
      )}
    >
      {value}
    </kbd>
  );
}
