"use client";

import { useEffect, useState } from "react";

import type { ConnectionStatus } from "@/components/ui/ConnectionIndicator";

const EVERY_MS = 5000;
const TIMEOUT_MS = 3000;
/** Failed checks in a row before approval is disabled. */
const OFFLINE_AFTER = 3;

/** Polls the local server: one miss → reconnecting, three in a row → unavailable. */
export function useConnection(): ConnectionStatus {
  const [misses, setMisses] = useState(0);

  useEffect(() => {
    let live = true;
    const check = async () => {
      const ok = await fetch("/api/v1/health/", {
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
        .then((res) => res.ok)
        .catch(() => false);
      if (live) setMisses((m) => (ok ? 0 : m + 1));
    };
    const timer = setInterval(() => void check(), EVERY_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);

  if (misses === 0) return "online";
  return misses >= OFFLINE_AFTER ? "unavailable" : "reconnecting";
}
