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
        "flex h-[48px] items-center gap-[8px] rounded-[10px] border border-line bg-surface px-[14px]",
        "focus-within:border-primary focus-within:shadow-[0_0_0_3px_var(--color-focus)]",
        wrapperClassName,
      )}
    >
      <SearchIcon className="flex-none text-muted" />
      <input
        type="search"
        aria-label={label}
        className={cn(
          "min-w-0 flex-1 border-0 bg-transparent p-0 text-[14px] text-ink outline-none placeholder:text-muted",
          className,
        )}
        {...props}
      />
      {shortcut && <KeyboardHint value={shortcut} />}
    </div>
  );
}
