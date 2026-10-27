"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

const EVERY_MS = 30_000;

/** Re-reads the order from the server while it is open, so the customer sees each step land. */
export function OrderAutoRefresh({ active }: { active: boolean }) {
  const t = useTranslations("store");
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = setInterval(refresh, EVERY_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [active, router]);
  return active ? <p className="m-0 text-label text-text-muted">{t("autoRefresh")}</p> : null;
}
