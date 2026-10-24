"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import type { ConnectionStatus } from "@/components/ui/ConnectionIndicator";
import { cn } from "@/lib/cn";

const TONE: Record<ConnectionStatus, string> = {
  online: "text-text",
  reconnecting: "text-warning-text",
  unavailable: "text-danger-text",
};

const clock = () =>
  new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });

type Props = {
  status: ConnectionStatus;
  text: string;
  /** Opens the navigation drawer (the only way to the other modules from a phone screen). */
  onMenu?: () => void;
  /** Fixed time for previews. */
  time?: string;
};

/** The 28px strip above a phone screen: time and server state (Raff Mobile). */
export function PhoneStatus({ status, text, onMenu, time }: Props) {
  const t = useTranslations("shell");
  const [now, setNow] = useState(time ?? "");
  useEffect(() => {
    if (time) return;
    const tick = () => setNow(clock());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [time]);
  return (
    <div className="flex h-[28px] flex-none items-center justify-between px-[20px] text-caption font-semibold">
      <span className="num" dir="ltr">
        {now}
      </span>
      {onMenu ? (
        <button
          type="button"
          onClick={onMenu}
          aria-label={`${t("menu")} · ${text}`}
          className={cn(
            "relative inline-flex cursor-pointer items-center border-0 bg-transparent p-0 text-caption font-semibold",
            // 44px touch target around the 28px strip
            "before:absolute before:-inset-x-[12px] before:-inset-y-[8px] before:content-['']",
            TONE[status],
          )}
        >
          <span role="status">{text}</span>
        </button>
      ) : (
        <span role="status" className={TONE[status]}>
          {text}
        </span>
      )}
    </div>
  );
}
