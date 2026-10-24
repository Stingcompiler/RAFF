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
        "grid gap-[4px] rounded-card border border-border bg-surface p-(--d-card-pad)",
        className,
      )}
    >
      <span className="text-label text-text-muted">{label}</span>
      <span dir="ltr" className="text-start type-metric [overflow-wrap:anywhere] num">
        {value}
      </span>
      {trio && (
        <div className="grid grid-cols-3 gap-[8px]">
          {trio.map((t, i) => (
            <div key={i} className="grid gap-[2px]">
              <span className="text-section font-medium">
                <span className="num">{t.value}</span>
              </span>
              <span className="text-caption text-text-muted">{t.label}</span>
            </div>
          ))}
        </div>
      )}
      <span className="text-caption text-text-muted">{note}</span>
    </div>
  );
}
