import { cn } from "@/lib/cn";

/** 12px ring spinner in the current text color. */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-[12px] flex-none rounded-full border-2 border-current border-e-transparent animate-[raff-spin_.8s_linear_infinite]",
        className,
      )}
    />
  );
}
