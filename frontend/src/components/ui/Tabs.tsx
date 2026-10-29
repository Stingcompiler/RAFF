"use client";

import { type KeyboardEvent, useRef } from "react";

import { cn } from "@/lib/cn";

type Props<T extends string> = {
  items: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  className?: string;
  /** Extra content at the inline end of the tab bar (e.g. a Segmented). */
  end?: React.ReactNode;
  /** Id prefix linking each tab to its panel (`${idBase}-panel-${id}`), when the screen renders one. */
  idBase?: string;
};

/**
 * A tab bar with the keyboard of the ARIA tabs pattern (review C-07): one tab in the Tab
 * order, arrows move between tabs (and follow the reading direction), Home/End jump; each tab
 * keeps a 44px touch area.
 */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
  className,
  end,
  idBase,
}: Props<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
    const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 }[e.key];
    let next = index;
    if (step) next = (index + step + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    else return;
    e.preventDefault();
    const target = items[next];
    if (!target) return;
    onChange(target.id);
    refs.current[next]?.focus();
  };
  return (
    <div className={cn("flex gap-[16px] border-b border-border", className)}>
      <div role="tablist" aria-label={label} className="contents">
        {items.map((item, index) => {
          const active = item.id === value;
          return (
            <button
              key={item.id}
              ref={(el) => {
                refs.current[index] = el;
              }}
              type="button"
              role="tab"
              id={idBase ? `${idBase}-tab-${item.id}` : undefined}
              aria-controls={idBase ? `${idBase}-panel-${item.id}` : undefined}
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(item.id)}
              onKeyDown={(e) => move(e, index)}
              className={cn(
                "hit-44 min-h-[20px] cursor-pointer border-0 bg-transparent px-[4px] py-[8px] type-inherit font-medium",
                "transition-[color,box-shadow] duration-(--motion-feedback)",
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
