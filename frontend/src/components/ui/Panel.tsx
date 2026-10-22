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
    <div className={cn("overflow-hidden rounded-[12px] border border-line bg-surface", className)}>
      {(title || note) && (
        <div className="flex items-center justify-between gap-[12px] border-b border-line px-[16px] py-[12px]">
          <span className="text-[16px] font-medium whitespace-nowrap">{title}</span>
          {note && <span className="text-end text-[12px] text-muted">{note}</span>}
        </div>
      )}
      {chips && (
        <div className="flex flex-wrap gap-[8px] border-b border-line px-[16px] py-[10px]">
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
        "rounded-full border border-line px-[12px] py-[4px] text-[13px]",
        active ? "bg-accent font-medium" : "text-muted",
      )}
    >
      {children}
    </span>
  );
}
