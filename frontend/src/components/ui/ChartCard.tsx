"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Button } from "./Button";
import { Panel } from "./Panel";
import { Skeleton } from "./Skeleton";
import { StaleStamp } from "./StaleStamp";

const SKELETON_BARS = [55, 80, 40, 90, 65, 75, 50] as const;

export type ChartState = "ready" | "loading" | "empty" | "failed";

type Props = {
  /** A sentence that carries the takeaway, not just the metric's name (v2.2 §16.3). */
  title: ReactNode;
  /** Unit and period, so the chart and its table agree. */
  note?: ReactNode;
  state: ChartState;
  /** A chart drawn from older data says when it was read. */
  staleAt?: string | Date;
  onRetry?: () => void;
  children: ReactNode;
  className?: string;
};

/**
 * The frame around every chart: title with the takeaway, unit and period, and the four
 * states of v2.2 §16.3 — loading (a skeleton in the chart's shape), empty (with a way
 * forward), failed (with a retry) and stale (with its time).
 */
export function ChartCard({ title, note, state, staleAt, onRetry, children, className }: Props) {
  const t = useTranslations("chart");
  return (
    <Panel title={title} note={note} className={className}>
      <div aria-busy={state === "loading"}>
        {state === "ready" && children}
        {state === "loading" && (
          <div
            role="status"
            aria-label={t("loading")}
            className="flex h-[180px] items-end gap-[12px] px-[16px] pt-[16px] pb-[8px]"
          >
            {SKELETON_BARS.map((h, i) => (
              <Skeleton key={i} className="flex-1 rounded-t-[4px]" style={{ height: `${h}%` }} />
            ))}
          </div>
        )}
        {state === "empty" && (
          <div className="grid h-[180px] content-center justify-items-center gap-[4px] p-[16px] text-center">
            <div className="font-medium">{t("empty")}</div>
            <div className="text-[13px] text-text-muted">{t("emptyHint")}</div>
          </div>
        )}
        {state === "failed" && (
          <div
            role="alert"
            className="grid h-[180px] content-center justify-items-center gap-[8px] p-[16px] text-center"
          >
            <div className="font-medium text-danger-text">{t("failed")}</div>
            {onRetry && (
              <Button variant="outline" onClick={onRetry}>
                {t("retry")}
              </Button>
            )}
          </div>
        )}
        {staleAt && state === "ready" && (
          <div className="border-t border-border px-(--d-pad) py-[8px]">
            <StaleStamp at={staleAt} onRefresh={onRetry} />
          </div>
        )}
      </div>
    </Panel>
  );
}
