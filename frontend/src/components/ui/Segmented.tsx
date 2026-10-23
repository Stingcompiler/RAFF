"use client";

import { cn } from "@/lib/cn";

type Props<T extends string> = {
  items: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  className?: string;
};

export function Segmented<T extends string>({
  items,
  value,
  onChange,
  label,
  className,
}: Props<T>) {
  return (
    <span
      role="radiogroup"
      aria-label={label}
      className={cn("flex gap-[2px] rounded-[8px] bg-surface-subtle p-[3px]", className)}
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(item.id)}
            className={cn(
              "cursor-pointer rounded-[6px] border-0 px-[12px] py-[4px] [font-family:inherit] [line-height:inherit] text-[13px] font-medium",
              "transition-[background,color] duration-200",
              active ? "bg-surface text-brand shadow-segment" : "bg-transparent text-text-muted",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </span>
  );
}
