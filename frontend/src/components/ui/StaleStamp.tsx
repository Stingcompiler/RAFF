"use client";

import { useTranslations } from "next-intl";

import { useDeviceOnline } from "@/lib/connectivity";
import { timeOfDay } from "@/lib/format";

import { Button } from "./Button";
import { SyncBadge } from "./SyncBadge";

type Props = {
  /** When the values on screen were read (ISO string or Date). */
  at: string | Date;
  onRefresh?: () => void;
};

/**
 * Every value that came from a cache carries its time (v2.2 §8). The refresh button stays
 * visible but waits for the connection, and says why.
 */
export function StaleStamp({ at, onRefresh }: Props) {
  const t = useTranslations("sync");
  const online = useDeviceOnline();
  const iso = typeof at === "string" ? at : at.toISOString();
  return (
    <span className="inline-flex flex-wrap items-center gap-[8px]">
      <SyncBadge state="stale" time={timeOfDay(iso)} />
      {onRefresh && (
        <Button
          variant="quiet"
          disabled={!online}
          title={online ? undefined : t("refreshNeedsConnection")}
          onClick={onRefresh}
        >
          {t("refresh")}
        </Button>
      )}
    </span>
  );
}
