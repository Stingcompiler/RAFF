"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Spinner } from "@/components/ui/Spinner";
import { apiUpload } from "@/lib/api/browser";
import { cn } from "@/lib/cn";

import { ReceiptPicker, receiptOk } from "./ReceiptPicker";

/** Attach the photo of the bank's confirmation to an order that has none (or replace it). */
export function ReceiptUpload({ token, has }: { token: string; has: boolean }) {
  const t = useTranslations("store");
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const valid = file !== null && receiptOk(file);

  const send = async () => {
    if (!file || !valid || busy) return;
    setBusy(true);
    setError(false);
    const form = new FormData();
    form.append("image", file);
    const res = await apiUpload(`/public/orders/${token}/receipt/`, form);
    setBusy(false);
    if (res.ok) {
      setFile(null);
      return router.refresh();
    }
    setError(true);
  };

  return (
    <div className="grid gap-[10px] rounded-card border border-border bg-surface p-[16px]">
      {has && <div className="font-medium text-success-text">{t("receiptOk")}</div>}
      <ReceiptPicker file={file} onChange={setFile} />
      <button
        type="button"
        onClick={send}
        disabled={!valid || busy}
        aria-busy={busy}
        className={cn(
          "flex min-h-[44px] items-center justify-center gap-[10px] rounded-card border-0 font-semibold",
          valid && !busy
            ? "cursor-pointer bg-brand text-on-brand"
            : "cursor-not-allowed bg-border text-text-muted",
        )}
      >
        {busy && <Spinner />}
        {has ? t("receiptReplace") : t("receiptSend")}
      </button>
      {error && (
        <div role="alert" className="font-medium text-danger-text">
          {t("receiptFail")}
        </div>
      )}
    </div>
  );
}
