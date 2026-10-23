"use client";

import { type ReactNode, useEffect, useRef } from "react";

import { cn } from "@/lib/cn";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

type Props = {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
  className?: string;
};

/** Side panel from the inline end (Raff Screens item drawer): 440px, scrim, focus trap. */
export function Drawer({ open, onClose, labelledBy, children, className }: Props) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const items = () => [...(node?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    (items()[0] ?? node)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      } else if (e.key === "Tab") {
        const list = items();
        if (list.length === 0) return e.preventDefault();
        const first = list[0]!;
        const last = list[list.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      opener?.focus?.();
    };
  }, [open, onClose]);

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-[4] bg-veil transition-opacity duration-(--motion-panel-in)",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <aside
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-hidden={!open}
        tabIndex={-1}
        className={cn(
          "fixed inset-y-0 end-0 z-[5] flex w-[440px] max-w-full flex-col border-s border-border bg-surface-raised shadow-drawer outline-none",
          "transition-transform duration-(--motion-panel-in) ease-[cubic-bezier(.2,.8,.2,1)]",
          open ? "translate-x-0" : "ltr:translate-x-[110%] rtl:-translate-x-[110%]",
          className,
        )}
      >
        {open && children}
      </aside>
    </>
  );
}

/** A key/value row inside a drawer tab. */
export function DrawerRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-[48px] items-center justify-between gap-[12px] border-b border-border px-[20px] py-[8px] animate-[raff-fade_var(--motion-scene)_ease_both]">
      <span className="text-text-muted">{label}</span>
      <span className="font-medium tabular-nums [unicode-bidi:isolate]">{children}</span>
    </div>
  );
}
