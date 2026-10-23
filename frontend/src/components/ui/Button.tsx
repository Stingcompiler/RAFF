import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "outline" | "quiet" | "danger";
export type ButtonSize = "md" | "lg" | "xl";

// `hover` and `forced` are spelled out in full: Tailwind only generates literal class names.
const VARIANTS: Record<ButtonVariant, { base: string; hover: string; forced: string }> = {
  primary: {
    base: "border-0 bg-brand text-on-brand font-semibold",
    hover: "hover:bg-[color-mix(in_oklab,var(--color-brand)_85%,var(--color-text))]",
    forced: "bg-[color-mix(in_oklab,var(--color-brand)_85%,var(--color-text))]",
  },
  outline: {
    base: "border border-border-strong bg-transparent text-text font-medium",
    hover: "hover:bg-surface-subtle",
    forced: "bg-surface-subtle",
  },
  quiet: {
    base: "border-0 bg-transparent text-brand font-semibold",
    hover: "hover:bg-surface-subtle",
    forced: "bg-surface-subtle",
  },
  danger: {
    base: "border-0 bg-danger-solid text-on-brand font-semibold",
    hover: "hover:bg-[color-mix(in_oklab,var(--color-danger-solid)_85%,var(--color-text))]",
    forced: "bg-[color-mix(in_oklab,var(--color-danger-solid)_85%,var(--color-text))]",
  },
};

const SIZES: Record<ButtonSize, string> = {
  md: "h-[40px] px-[16px] text-[14px]",
  lg: "h-[44px] px-[20px] text-[14px]",
  xl: "h-[48px] px-[20px] text-[16px]",
};

type StyleOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Documentation only: render the hover / focus look without interaction. */
  forceState?: "hover" | "focus";
};

export function buttonClasses({
  variant = "primary",
  size = "md",
  loading,
  forceState,
}: StyleOptions) {
  const v = VARIANTS[variant];
  return cn(
    "inline-flex items-center justify-center gap-[6px] rounded-control whitespace-nowrap cursor-pointer",
    "transition-[background,box-shadow,transform,filter] duration-(--motion-feedback)",
    "focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--color-surface),0_0_0_4px_var(--color-focus)]",
    "disabled:cursor-not-allowed disabled:border-0 disabled:bg-border disabled:text-text-muted disabled:active:scale-100",
    SIZES[size],
    v.base,
    forceState === "hover" ? v.forced : v.hover,
    forceState === "focus" &&
      "shadow-[0_0_0_2px_var(--color-surface),0_0_0_4px_var(--color-focus)]",
    loading && "opacity-85 cursor-progress",
  );
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> &
  StyleOptions & {
    /** Accessible text announced while loading. */
    loadingLabel?: string;
  };

export function Button({
  variant,
  size,
  loading = false,
  forceState,
  loadingLabel,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: Props) {
  return (
    <button
      type={type}
      className={cn(buttonClasses({ variant, size, loading, forceState }), className)}
      disabled={disabled}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Spinner />}
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  );
}
