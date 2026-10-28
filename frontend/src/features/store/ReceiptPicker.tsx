"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

const MAX_BYTES = 3 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png"];

/** True when the browser's file is a JPEG or PNG of at most 3 MB (the server checks again). */
export const receiptOk = (file: File) => TYPES.includes(file.type) && file.size <= MAX_BYTES;

/** Optional photo of the bank's confirmation. */
export function ReceiptPicker({
  file,
  onChange,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  const t = useTranslations("store");
  const id = useId();
  const bad = file !== null && !receiptOk(file);
  return (
    <div className="grid gap-[4px]">
      <label htmlFor={id} className="text-body font-semibold text-text-muted">
        {t("receiptL")}
      </label>
      <input
        id={id}
        type="file"
        accept="image/jpeg,image/png"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="min-h-[44px] rounded-control border border-border-strong bg-surface px-[10px] py-[8px] text-body text-text"
      />
      <span className="text-label font-normal text-text-muted">{t("receiptHint")}</span>
      {bad && <span className="text-label font-medium text-danger-text">{t("receiptBad")}</span>}
    </div>
  );
}
