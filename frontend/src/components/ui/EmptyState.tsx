import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type Props = { title: string; body?: string; action?: ReactNode; className?: string };

export function EmptyState({ title, body, action, className }: Props) {
  return (
    <div
      className={cn(
        "grid justify-items-center gap-[6px] rounded-[10px] border border-dashed border-line p-[20px] text-center",
        className,
      )}
    >
      <span className="font-medium">{title}</span>
      {body && <span className="text-[13px] text-muted">{body}</span>}
      {action}
    </div>
  );
}
