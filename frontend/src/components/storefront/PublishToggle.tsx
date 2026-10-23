"use client";

import { cn } from "@/lib/cn";

/** Disabled until image, description, price and class are complete. */
export function PublishToggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (next: boolean) => void;
}) {
  return (
    <div className={cn("flex items-center justify-between", disabled && "opacity-90")}>
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
        className={cn(
          "relative h-[26px] w-[44px] flex-none rounded-full border-0 p-0 transition-[background] duration-(--motion-feedback)",
          checked ? "bg-brand" : "bg-border",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        )}
      >
        <span
          className={cn(
            "absolute top-[3px] size-[20px] rounded-full bg-surface transition-[inset-inline-start] duration-(--motion-feedback)",
            checked ? "start-[21px]" : "start-[3px]",
          )}
        />
      </button>
    </div>
  );
}
