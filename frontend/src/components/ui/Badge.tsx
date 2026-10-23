import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/** `pending` is only for a record saved on this device and waiting to be sent (v2.2 §1, §8). */
export type Tone = "success" | "warn" | "danger" | "info" | "pending";

/** State is always symbol + text, never color alone. */
export const TONE_SYMBOL: Record<Tone, string> = {
  success: "●",
  warn: "▲",
  danger: "✕",
  info: "■",
  pending: "◌",
};

/** Text, fill and border of each status role; `pending` also gets a dashed border. */
export const TONE_CLASSES: Record<Tone, string> = {
  success: "text-success-text bg-success-bg border-success-border",
  warn: "text-warning-text bg-warning-bg border-warning-border",
  danger: "text-danger-text bg-danger-bg border-danger-border",
  info: "text-info-text bg-info-bg border-info-border",
  pending: "text-pending-text bg-pending-bg border-pending-border border-dashed",
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
        "rounded-pill border py-[1px] text-[12px] font-medium whitespace-nowrap",
        dense ? "px-[7px]" : "px-[9px]",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {TONE_SYMBOL[tone]} {children}
    </span>
  );
}

export function toneText(tone: Tone) {
  return TONE_CLASSES[tone].split(" ")[0];
}
