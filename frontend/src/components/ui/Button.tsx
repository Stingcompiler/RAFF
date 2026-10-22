import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "outline" | "quiet" | "danger";
export type ButtonSize = "md" | "lg" | "xl";

// `hover` and `forced` are spelled out in full: Tailwind only generates literal class names.
const VARIANTS: Record<ButtonVariant, { base: string; hover: string; forced: string }> = {
  primary: {
    base: "border-0 bg-primary text-primary-ink font-semibold",
    hover: "hover:bg-[color-mix(in_oklab,var(--color-primary)_85%,var(--color-ink))]",
    forced: "bg-[color-mix(in_oklab,var(--color-primary)_85%,var(--color-ink))]",
  },
  outline: {
    base: "border border-line bg-transparent text-ink font-medium",
    hover: "hover:bg-sidebar",
    forced: "bg-sidebar",
  },
  quiet: {
    base: "border-0 bg-transparent text-primary font-semibold",
    hover: "hover:bg-sidebar",
    forced: "bg-sidebar",
  },
  danger: {
    base: "border-0 bg-danger text-primary-ink font-semibold",
    hover: "hover:bg-[color-mix(in_oklab,var(--color-danger)_85%,var(--color-ink))]",
    forced: "bg-[color-mix(in_oklab,var(--color-danger)_85%,var(--color-ink))]",
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
    "inline-flex items-center justify-center gap-[6px] rounded-[10px] whitespace-nowrap cursor-pointer",
    "transition-[background,box-shadow,transform,filter] duration-200 active:scale-[.98]",
    "focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_var(--color-focus)]",
    "disabled:cursor-not-allowed disabled:border-0 disabled:bg-line disabled:text-muted disabled:active:scale-100",
    SIZES[size],
    v.base,
    forceState === "hover" ? v.forced : v.hover,
    forceState === "focus" && "shadow-[0_0_0_3px_var(--color-focus)]",
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
