"use client";

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

import { cn } from "@/lib/cn";

export type ToastTone = "success" | "warn" | "danger";

type ToastItem = { id: number; tone: ToastTone; message: string; requestId?: string };

const SYMBOL: Record<ToastTone, string> = { success: "✓", warn: "▲", danger: "✕" };
const TONE: Record<ToastTone, string> = {
  success: "text-success-text bg-success-bg border-success-solid",
  warn: "text-warning-text bg-warning-bg border-warning-solid",
  danger: "text-danger-text bg-danger-bg border-danger-solid",
};

/** One toast; errors stay until dismissed and show a short request id. */
export function Toast({
  tone,
  message,
  requestId,
  onDismiss,
  dismissLabel,
}: Omit<ToastItem, "id"> & { onDismiss?: () => void; dismissLabel?: string }) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex items-center gap-[10px] rounded-control border px-[14px] py-[10px]",
        "animate-[raff-in_.35s_cubic-bezier(.2,.8,.2,1)_both]",
        TONE[tone],
      )}
    >
      <span aria-hidden="true">{SYMBOL[tone]}</span>
      <span className="flex-1 font-medium">{message}</span>
      {requestId && (
        <span dir="ltr" className="text-caption opacity-80 num">
          {requestId}
        </span>
      )}
      {onDismiss && dismissLabel && (
        <button
          type="button"
          aria-label={dismissLabel}
          onClick={onDismiss}
          className="cursor-pointer border-0 bg-transparent p-0 text-current"
        >
          {SYMBOL.danger}
        </button>
      )}
    </div>
  );
}

type ToastApi = { push: (tone: ToastTone, message: string, requestId?: string) => void };

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside <ToastProvider>");
  return api;
}

export function ToastProvider({
  children,
  dismissLabel,
}: {
  children: ReactNode;
  dismissLabel: string;
}) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback(
    (id: number) => setItems((all) => all.filter((t) => t.id !== id)),
    [],
  );
  const push = useCallback<ToastApi["push"]>(
    (tone, message, requestId) => {
      const id = Date.now() + Math.random();
      setItems((all) => [...all, { id, tone, message, requestId }].slice(-3));
      if (tone !== "danger") setTimeout(() => dismiss(id), 3500);
    },
    [dismiss],
  );
  const api = useMemo(() => ({ push }), [push]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-[24px] z-[9] grid justify-center gap-[8px]">
        {items.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <Toast
              {...t}
              onDismiss={t.tone === "danger" ? () => dismiss(t.id) : undefined}
              dismissLabel={dismissLabel}
            />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
