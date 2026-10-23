import type { CSSProperties, HTMLAttributes, KeyboardEvent, ReactNode } from "react";

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

/** Narrowest a flexible track may get before the table scrolls instead of squeezing it. */
const FLEX_MIN = 140;
const GAP = 12;
const GUTTER = 32;

const trackMin = (width?: string) => {
  const px = /^(\d+(?:\.\d+)?)px$/.exec(width ?? "");
  return px ? Number(px[1]) : FLEX_MIN;
};

const gridStyle = (columns: readonly Column[]) =>
  ({
    gridTemplateColumns: columns.map((c) => c.width ?? "1fr").join(" "),
    // Phones only: rows keep this width and the table scrolls inside its card (globals.css).
    "--row-min": `${columns.reduce(
      (sum, c) => sum + trackMin(c.width),
      GUTTER + GAP * (columns.length - 1),
    )}px`,
  }) as CSSProperties;

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
        "grid h-(--d-row) items-center gap-[12px] border-b border-border bg-surface-subtle px-(--d-pad) type-label text-text-secondary",
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
        "relative grid min-h-(--d-row) items-center gap-[12px] border-b border-border px-(--d-pad) text-(length:--d-font)",
        "transition-[filter,background] duration-(--motion-feedback)",
        interactive &&
          "cursor-pointer hover:brightness-[.97] focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--color-focus)]",
        selected &&
          "bg-selection-bg before:absolute before:inset-y-0 before:start-0 before:w-[3px] before:bg-selection-border",
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
    <div className="border-t border-border p-[16px] text-center text-[13px] text-text-muted">
      {children}
    </div>
  );
}

export function TableSkeletonRow({ columns }: { columns: readonly Column[] }) {
  return (
    <div
      aria-hidden="true"
      style={gridStyle(columns)}
      className="grid h-(--d-row) items-center gap-[12px] border-t border-border px-(--d-pad)"
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
