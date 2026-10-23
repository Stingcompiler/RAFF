import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

import { SyncBadge, type SyncState } from "./SyncBadge";

const OF = "/";

/**
 * What the bar says. Device and server are told apart (v2.2 §8): "your device is offline"
 * versus "the server cannot be reached — the problem is not on your device".
 */
export type ConnectionBarKind = "device-offline" | "server-unreachable" | "syncing";

const LOOK: Record<ConnectionBarKind, { state: SyncState; box: string }> = {
  "device-offline": {
    state: "offline",
    box: "border-pending-border bg-pending-bg text-pending-text",
  },
  "server-unreachable": {
    state: "failed",
    box: "border-warning-border bg-warning-bg text-warning-text",
  },
  syncing: { state: "syncing", box: "border-info-border bg-info-bg text-info-text" },
};

type Props = {
  kind: ConnectionBarKind;
  /** Syncing progress: records sent of records waiting. */
  progress?: { done: number; total: number };
  /** An action that is blocked, with the reason it is blocked. */
  children?: ReactNode;
  className?: string;
};

/** A quiet strip: never a blocking dialog, never a full-screen loader. */
export function ConnectionBar({ kind, progress, children, className }: Props) {
  const t = useTranslations("sync");
  const { state, box } = LOOK[kind];
  const body =
    kind === "device-offline"
      ? t("deviceOfflineBody")
      : kind === "server-unreachable"
        ? t("serverUnreachableBody")
        : t("syncingBody");
  const title =
    kind === "device-offline"
      ? t("deviceOffline")
      : kind === "server-unreachable"
        ? t("serverUnreachable")
        : t("syncingTitle");
  return (
    <div
      role="status"
      className={cn(
        "flex flex-none flex-wrap items-center gap-x-[12px] gap-y-[6px] border-b px-[16px] py-[8px]",
        box,
        className,
      )}
    >
      <SyncBadge state={state} className="border-current bg-transparent" />
      <span className="min-w-0 flex-1">
        <b className="font-semibold">{title}</b> {body}
      </span>
      {progress && (
        <span className="flex items-center gap-[8px]">
          <span
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.done}
            className="h-[6px] w-[96px] overflow-hidden rounded-pill bg-info-border"
          >
            <span
              className="block h-full bg-info-solid"
              style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
            />
          </span>
          <span dir="ltr" className="tabular-nums">
            {progress.done}
            {OF}
            {progress.total}
          </span>
        </span>
      )}
      {children}
    </div>
  );
}
