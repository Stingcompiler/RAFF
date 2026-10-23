import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
  /** Required: every action icon needs a label. */
  label: string;
  children: ReactNode;
};

export function IconButton({ label, className, children, type = "button", ...props }: Props) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-[44px] place-items-center rounded-[10px] border border-border bg-surface p-0 text-text cursor-pointer",
        "transition-[background,transform] duration-200 hover:bg-surface-subtle active:scale-[.96]",
        "focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--color-surface),0_0_0_4px_var(--color-focus)]",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
