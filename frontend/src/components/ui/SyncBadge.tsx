import { Clock, Cloud, RefreshCw, Save, TriangleAlert, WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ComponentType, SVGProps } from "react";

import { cn } from "@/lib/cn";

import { type Tone, TONE_CLASSES } from "./Badge";

/** The six states of a record or screen relative to the server (Design Reference v2.2 §8). */
export type SyncState = "synced" | "offline" | "pending" | "syncing" | "failed" | "stale";

type Icon = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

const SPEC: Record<SyncState, { tone: Tone; icon: Icon }> = {
  synced: { tone: "success", icon: Cloud },
  offline: { tone: "pending", icon: WifiOff },
  pending: { tone: "pending", icon: Save },
  syncing: { tone: "info", icon: RefreshCw },
  failed: { tone: "danger", icon: TriangleAlert },
  stale: { tone: "neutral", icon: Clock },
};

type Props = {
  state: SyncState;
  /** The time a stale value was read (hh:mm). */
  time?: string;
  className?: string;
};

/** Icon + text + color, never color alone. A record waiting to send also has a dashed border. */
export function SyncBadge({ state, time, className }: Props) {
  const t = useTranslations("sync");
  const { tone, icon: Icon } = SPEC[state];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[6px] rounded-pill border px-[9px] py-[1px] text-caption font-medium whitespace-nowrap",
        TONE_CLASSES[tone],
        className,
      )}
    >
      <Icon size={13} aria-hidden="true" className={state === "syncing" ? "animate-spin" : ""} />
      {state === "stale" ? t("stale", { time: time ?? "" }) : t(state)}
    </span>
  );
}
