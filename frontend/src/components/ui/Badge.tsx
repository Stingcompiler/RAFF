import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export type Tone = "success" | "warn" | "danger" | "info";

/** State is always symbol + text, never color alone. */
export const TONE_SYMBOL: Record<Tone, string> = {
  success: "●",
  warn: "▲",
  danger: "✕",
  info: "■",
};

const TONES: Record<Tone, string> = {
  success: "text-success-text bg-success-bg",
  warn: "text-warning-text bg-warning-bg",
  danger: "text-danger-text bg-danger-bg",
  info: "text-info-text bg-info-bg",
};

type Props = {
  tone: Tone;
  children: ReactNode;
  /** Tables use 8px side padding, galleries 10px. */
  dense?: boolean;
  className?: string;
};

export function Badge({ tone, children, dense, className }: Props) {
  return (
    <span
      className={cn(
        "rounded-full py-[2px] text-[12px] font-medium whitespace-nowrap",
        dense ? "px-[8px]" : "px-[10px]",
        TONES[tone],
        className,
      )}
    >
      {TONE_SYMBOL[tone]} {children}
    </span>
  );
}

export function toneText(tone: Tone) {
  return TONES[tone].split(" ")[0];
}
