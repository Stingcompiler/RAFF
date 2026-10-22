import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { useId } from "react";

import { cn } from "@/lib/cn";

/** Shared look of text inputs: 44px content height, line border, bg fill. */
export const controlClasses = cn(
  "h-[44px] rounded-[8px] border border-line bg-bg px-[12px] py-0 text-[14px] font-normal text-ink",
  "outline-none transition-[border-color,box-shadow] duration-200",
  "focus:border-2 focus:border-primary focus:px-[11px] focus:shadow-[0_0_0_3px_var(--color-focus)]",
  "aria-[invalid=true]:border-2 aria-[invalid=true]:border-danger aria-[invalid=true]:px-[11px]",
  "disabled:bg-sidebar disabled:text-muted",
);

type FieldProps = {
  label: string;
  /** Helper text, or the error when `error` is set. */
  help?: string;
  error?: string;
  children: (ids: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
  className?: string;
};

/** Label + control + helper/error text. Errors carry the ✕ symbol, never color alone. */
export function Field({ label, help, error, children, className }: FieldProps) {
  const id = useId();
  const helpId = `${id}-help`;
  const message = error ? `✕ ${error}` : help;
  return (
    <label
      htmlFor={id}
      className={cn("grid gap-[4px] text-[12px] font-medium text-muted", className)}
    >
      {label}
      {children({ id, describedBy: message ? helpId : undefined, invalid: !!error })}
      {message && (
        <span id={helpId} className={error ? "text-danger" : "font-normal text-muted"}>
          {message}
        </span>
      )}
    </label>
  );
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlClasses, className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(controlClasses, "box-content", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(controlClasses, "h-auto min-h-[88px] py-[10px] focus:py-[9px]", className)}
      {...props}
    />
  );
}
