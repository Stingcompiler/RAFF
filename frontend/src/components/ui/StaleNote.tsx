"use client";

import { useTranslations } from "next-intl";

/** Shown when refreshing a list failed: the rows on screen are the last ones read, not today's
 * answer to the current filter (review C-05). */
export function StaleNote({ show }: { show: boolean }) {
  const t = useTranslations("common");
  if (!show) return null;
  return (
    <div
      role="status"
      className="rounded-control border border-warning-solid bg-warning-bg px-[12px] py-[8px] text-label font-medium text-warning-text"
    >
      {t("stale")}
    </div>
  );
}
