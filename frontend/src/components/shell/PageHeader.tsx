import type { ReactNode } from "react";

/** Screen title (page role) with actions at the inline end. */
export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-[16px]">
      <h1 className="m-0 type-page whitespace-nowrap">{title}</h1>
      {actions && <div className="flex gap-[8px]">{actions}</div>}
    </div>
  );
}
