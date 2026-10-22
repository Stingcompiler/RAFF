import type { HTMLAttributes, KeyboardEvent, ReactNode } from "react";

import { cn } from "@/lib/cn";

import { Badge, type Tone } from "./Badge";
import { Skeleton } from "./Skeleton";

/**
 * Grid table matching the design: a 36px header on surface-raised, 44px rows,
 * numeric columns end-aligned with tabular figures. Columns are CSS grid tracks.
 */
export type Column = {
  header: ReactNode;
  /** Grid track, e.g. "1fr", "90px", "minmax(0,1.6fr)". */
  width?: string;
  numeric?: boolean;
};

const gridStyle = (columns: readonly Column[]) => ({
  gridTemplateColumns: columns.map((c) => c.width ?? "1fr").join(" "),
});

export function TableHead({
  columns,
  className,
}: {
  columns: readonly Column[];
  className?: string;
}) {
  return (
    <div
      role="row"
      style={gridStyle(columns)}
      className={cn(
        "grid h-[36px] items-center gap-[12px] border-b border-line bg-surface-raised px-[16px] text-[12px] font-medium text-muted",
        className,
      )}
    >
      {columns.map((c, i) => (
        <span key={i} role="columnheader" className={c.numeric ? "text-end" : undefined}>
          {c.header}
        </span>
      ))}
    </div>
  );
}

type RowProps = HTMLAttributes<HTMLDivElement> & {
  columns: readonly Column[];
  selected?: boolean;
  disabled?: boolean;
  onActivate?: () => void;
};

export function TableRow({
  columns,
  selected,
  disabled,
  onActivate,
  className,
  children,
  ...props
}: RowProps) {
  const interactive = !!onActivate && !disabled;
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (interactive && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      onActivate?.();
    }
  };
  return (
    <div
      role="row"
      aria-selected={selected || undefined}
      aria-disabled={disabled || undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? onActivate : undefined}
      onKeyDown={onKeyDown}
      style={gridStyle(columns)}
      className={cn(
        "grid min-h-[44px] items-center gap-[12px] border-b border-line px-[16px] text-[14px]",
        "transition-[filter,background] duration-150",
        interactive &&
          "cursor-pointer hover:brightness-[.97] focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_3px_var(--color-focus)]",
        selected && "bg-accent",
        disabled && "opacity-60",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/** Plain text cell, truncated. */
export function TextCell({ children }: { children: ReactNode }) {
  return (
    <span role="cell" className="truncate">
      {children}
    </span>
  );
}

/** Number cell: end-aligned, tabular, isolated direction. */
export function NumberCell({ children }: { children: ReactNode }) {
  return (
    <span role="cell" className="text-end tabular-nums [unicode-bidi:isolate]">
      {children}
    </span>
  );
}

/** Code-like cell: dates, batches, barcodes — 13px tabular, isolated LTR. */
export function CodeCell({ children }: { children: ReactNode }) {
  return (
    <span
      role="cell"
      dir="ltr"
      className="text-start text-[13px] tabular-nums [unicode-bidi:isolate]"
    >
      {children}
    </span>
  );
}

export function BadgeCell({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span role="cell" className="justify-self-start">
      <Badge tone={tone} dense>
        {children}
      </Badge>
    </span>
  );
}

export function TableEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="border-t border-line p-[16px] text-center text-[13px] text-muted">
      {children}
    </div>
  );
}

export function TableSkeletonRow({ columns }: { columns: readonly Column[] }) {
  return (
    <div
      aria-hidden="true"
      style={gridStyle(columns)}
      className="grid h-[44px] items-center gap-[12px] border-t border-line px-[12px]"
    >
      {columns.map((_, i) => (
        <Skeleton key={i} className={i === 0 ? "size-[18px]" : i === 1 ? "w-[70%]" : "w-full"} />
      ))}
    </div>
  );
}

export function Table({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div role="table" aria-label={label} className={className}>
      {children}
    </div>
  );
}
