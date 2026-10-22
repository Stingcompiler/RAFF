import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type Props = {
  label: string;
  value?: ReactNode;
  note?: ReactNode;
  /** Three small figures under the label (e.g. new / confirmed / completed). */
  trio?: readonly { value: ReactNode; label: string }[];
  className?: string;
};

export function StatTile({ label, value, note, trio, className }: Props) {
  return (
    <div
      className={cn(
        "grid gap-[4px] rounded-[12px] border border-line bg-surface p-[16px]",
        "transition-[transform,box-shadow] duration-200 hover:-translate-y-[2px] hover:shadow-tile",
        className,
      )}
    >
      <span className="text-[13px] text-muted">{label}</span>
      <span
        dir="ltr"
        className="text-start text-[24px] font-medium tabular-nums [overflow-wrap:anywhere]"
      >
        {value}
      </span>
      {trio && (
        <div className="grid grid-cols-3 gap-[8px]">
          {trio.map((t, i) => (
            <div key={i} className="grid gap-[2px]">
              <span className="text-[24px] font-medium tabular-nums">{t.value}</span>
              <span className="text-[12px] text-muted">{t.label}</span>
            </div>
          ))}
        </div>
      )}
      <span className="text-[12px] text-muted">{note}</span>
    </div>
  );
}
