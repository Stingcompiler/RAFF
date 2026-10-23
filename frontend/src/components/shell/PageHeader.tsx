import type { ReactNode } from "react";

/** Screen title (page role) with actions at the inline end. */
export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-[16px] gap-y-[8px]">
      <h1 className="m-0 min-w-0 type-page">{title}</h1>
      {actions && <div className="flex flex-wrap gap-[8px]">{actions}</div>}
    </div>
  );
}
