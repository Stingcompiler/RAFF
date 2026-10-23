import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

import { SearchIcon } from "./icons";
import { KeyboardHint } from "./KeyboardHint";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  /** Visible shortcut, e.g. F2. */
  shortcut?: string;
  /** Accessible name when no visible label exists. */
  label: string;
  wrapperClassName?: string;
};

export function SearchField({ shortcut, label, className, wrapperClassName, ...props }: Props) {
  return (
    <div
      className={cn(
        "flex h-[48px] items-center gap-[8px] rounded-control border border-border-strong bg-surface px-[14px]",
        "focus-within:border-brand focus-within:shadow-[0_0_0_2px_var(--color-surface),0_0_0_4px_var(--color-focus)]",
        wrapperClassName,
      )}
    >
      <SearchIcon className="flex-none text-text-muted" />
      <input
        type="search"
        aria-label={label}
        className={cn(
          "min-w-0 flex-1 border-0 bg-transparent p-0 text-[14px] text-text outline-none placeholder:text-text-muted",
          className,
        )}
        {...props}
      />
      {shortcut && <KeyboardHint value={shortcut} />}
    </div>
  );
}
