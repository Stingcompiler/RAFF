"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

type InstallEvent = Event & { prompt: () => Promise<void> };

/** Registers the shop's service worker (production only, so the dev server stays uncached). */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}

/** "Install the app": shown only where the browser offers it (Android/desktop Chrome, Edge). */
export function InstallButton() {
  const t = useTranslations("store");
  const [event, setEvent] = useState<InstallEvent | null>(null);
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
    };
    const onInstalled = () => setEvent(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  if (!event) return null;
  return (
    <button
      type="button"
      onClick={() => {
        void event.prompt();
        setEvent(null);
      }}
      className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-control border border-brand bg-transparent px-[14px] font-semibold text-brand"
    >
      {t("install")}
    </button>
  );
}
