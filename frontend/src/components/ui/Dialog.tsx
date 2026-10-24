"use client";

import { type ReactNode, type RefObject, useEffect, useRef } from "react";

import { cn } from "@/lib/cn";

import { Button } from "./Button";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

type DialogProps = {
  open: boolean;
  /** Called on Escape or backdrop click; omit to make the dialog modal-only (e.g. while busy). */
  onClose?: () => void;
  labelledBy: string;
  children: ReactNode;
  className?: string;
  /** Absolute inside a positioned container (designs, previews) instead of fixed. */
  contained?: boolean;
  /** Element to focus on open (default: the first focusable). */
  initialFocus?: RefObject<HTMLElement | null>;
};

/** Modal dialog with a focus trap; restores focus to the opener on close. */
export function Dialog({
  open,
  onClose,
  labelledBy,
  children,
  className,
  contained,
  initialFocus,
}: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  // Parents pass a new onClose on every render; reading it through a ref keeps the effect
  // below tied to `open` only, so a background re-render never moves focus mid-typing.
  const closeRef = useRef(onClose);
  const focusRef = useRef(initialFocus);
  useEffect(() => {
    closeRef.current = onClose;
    focusRef.current = initialFocus;
  });

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const focusables = () => [...(node?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    (focusRef.current?.current ?? focusables()[0] ?? node)?.focus();

    const onKey = (e: KeyboardEvent) => {
      const close = closeRef.current;
      if (e.key === "Escape" && close) {
        e.stopPropagation();
        close();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return e.preventDefault();
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      opener?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      className={cn(
        "inset-0 z-[8] grid place-items-center bg-veil animate-[raff-fade_var(--motion-scene)_ease_both]",
        contained ? "absolute" : "fixed",
      )}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={cn(
          "grid w-[460px] max-w-[calc(100vw-80px)] gap-[14px] rounded-panel border border-border bg-surface-raised p-[24px] shadow-dialog outline-none",
          // Phones: nearly full width, scrolling inside when the content is taller than the screen.
          "max-[760px]:box-border max-[760px]:max-h-[calc(100dvh-24px)] max-[760px]:max-w-[calc(100vw-24px)] max-[760px]:overflow-y-auto max-[760px]:p-[16px]",
          "animate-[raff-fade_var(--motion-scene)_cubic-bezier(.2,.8,.2,1)_both]",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export type Impact = { label: string; value: string };

type ConfirmProps = {
  open: boolean;
  title: string;
  body: string;
  /** Financial / stock effect shown before approving. */
  impact?: readonly Impact[];
  cancelLabel: string;
  confirmLabel: string;
  busyLabel: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  contained?: boolean;
};

/** Every approval shows its effect first; the approve button is disabled while pending. */
export function ConfirmDialog({
  open,
  title,
  body,
  impact,
  cancelLabel,
  confirmLabel,
  busyLabel,
  busy = false,
  onCancel,
  onConfirm,
  contained,
}: ConfirmProps) {
  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onCancel}
      labelledBy="confirm-title"
      contained={contained}
    >
      <div id="confirm-title" className="text-lead font-medium">
        {title}
      </div>
      <div className="text-text-muted">{body}</div>
      {impact && impact.length > 0 && (
        <div className="grid gap-[6px] rounded-control bg-warning-bg p-[12px] font-medium text-warning-text">
          {impact.map((i) => (
            <div key={i.label} className="flex justify-between gap-[12px]">
              <span>{i.label}</span>
              <span dir="ltr" className="num">
                {i.value}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-end gap-[8px]">
        <Button variant="outline" size="lg" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button
          size="lg"
          onClick={onConfirm}
          disabled={busy}
          className={busy ? "cursor-progress" : undefined}
        >
          {busy ? busyLabel : confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
