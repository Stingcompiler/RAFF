"use client";

import { cn } from "@/lib/cn";

type Props<T extends string> = {
  items: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  className?: string;
  /** Extra content at the inline end of the tab bar (e.g. a Segmented). */
  end?: React.ReactNode;
};

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
  className,
  end,
}: Props<T>) {
  return (
    <div className={cn("flex gap-[16px] border-b border-border", className)}>
      <div role="tablist" aria-label={label} className="contents">
        {items.map((item) => {
          const active = item.id === value;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(item.id)}
              className={cn(
                "min-h-[20px] cursor-pointer border-0 bg-transparent px-[4px] py-[8px] type-inherit font-medium",
                "transition-[color,box-shadow] duration-200",
                active
                  ? "text-brand shadow-[inset_0_-2px_0_var(--color-brand)]"
                  : "text-text-muted shadow-[inset_0_-2px_0_transparent]",
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {end}
    </div>
  );
}
