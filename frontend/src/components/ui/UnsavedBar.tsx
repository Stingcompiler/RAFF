"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { Button } from "./Button";
import { TONE_SYMBOL } from "./Badge";

type Props = {
  onSave: () => void;
  onDiscard: () => void;
  /** Disables both actions while a save is running. */
  busy?: boolean;
};

/**
 * The bar above an edit page with changes that are not saved yet (v2.2 §15.4). While it is
 * shown, closing or reloading the tab asks first; the page decides what save and discard do.
 */
export function UnsavedBar({ onSave, onDiscard, busy }: Props) {
  const t = useTranslations("common");
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  return (
    <div
      role="status"
      className="sticky top-0 z-[4] flex flex-wrap items-center justify-between gap-[12px] rounded-card border border-warning-border bg-warning-bg px-(--d-pad) py-[8px] text-warning-text"
    >
      <span className="font-semibold">
        {TONE_SYMBOL.warn} {t("unsavedChanges")}
      </span>
      <span className="flex gap-[8px]">
        <Button variant="outline" disabled={busy} onClick={onDiscard}>
          {t("discardChanges")}
        </Button>
        <Button disabled={busy} onClick={onSave}>
          {t("saveChanges")}
        </Button>
      </span>
    </div>
  );
}
