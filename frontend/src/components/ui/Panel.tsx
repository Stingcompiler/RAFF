import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type Props = {
  title?: ReactNode;
  note?: ReactNode;
  /** Filter chips row under the header. */
  chips?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** Card with an optional header (title + inline-end note). */
export function Panel({ title, note, chips, children, className }: Props) {
  return (
    <div className={cn("overflow-hidden rounded-panel border border-border bg-surface", className)}>
      {(title || note) && (
        <div className="flex items-center justify-between gap-[12px] border-b border-border px-(--d-pad) py-[12px]">
          <span className="text-[16px] font-medium whitespace-nowrap">{title}</span>
          {note && <span className="text-end text-[12px] text-text-muted">{note}</span>}
        </div>
      )}
      {chips && (
        <div className="flex flex-wrap gap-[8px] border-b border-border px-(--d-pad) py-[10px]">
          {chips}
        </div>
      )}
      {children}
    </div>
  );
}

/** Filter chip; the first/active one is filled with accent. */
export function Chip({ active, children }: { active?: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        "rounded-full border border-border px-[12px] py-[4px] text-[13px]",
        active ? "bg-brand-subtle font-medium" : "text-text-muted",
      )}
    >
      {children}
    </span>
  );
}
