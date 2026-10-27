"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";

import { Spinner } from "@/components/ui/Spinner";
import { apiSend } from "@/lib/api/browser";
import { cn } from "@/lib/cn";

const MIN_REFERENCE = 4;

/** Sends the bank transfer's number and amount for an order that was placed without them
 * (or whose transfer the pharmacy rejected). */
export function OrderPayment({
  token,
  accounts,
  estimate,
  rejectedNote,
}: {
  token: string;
  accounts: string;
  estimate: string;
  rejectedNote: string;
}) {
  const t = useTranslations("store");
  const router = useRouter();
  const [reference, setReference] = useState("");
  const [paid, setPaid] = useState(estimate.replace(/\.0+$/, ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refOk = reference.replace(/\s/g, "").length >= MIN_REFERENCE;
  const valid = refOk && Number(paid) > 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const res = await apiSend("POST", `/public/orders/${token}/payment/`, {
      reference: reference.trim(),
      paid_amount: paid,
    });
    setBusy(false);
    if (res.ok) return router.refresh();
    const code = typeof res.error?.detail === "string" ? res.error.detail : "";
    setError(
      res.status === 429
        ? t("rateLimited")
        : code === "reference_used"
          ? t("refUsed")
          : t("failPay"),
    );
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      className="grid gap-[12px] rounded-card border border-border bg-surface p-[16px]"
    >
      <h2 className="m-0 text-land-lead font-semibold">{t("sendTransfer")}</h2>
      {rejectedNote && (
        <div
          role="status"
          className="rounded-control bg-warning-bg px-[14px] py-[10px] font-medium text-warning-text"
        >
          {t("rejectedB", { note: rejectedNote })}
        </div>
      )}
      {accounts && (
        <div className="grid gap-[4px]">
          <div className="text-label font-semibold text-text-muted">{t("bankAccounts")}</div>
          <div className="whitespace-pre-wrap">{accounts}</div>
        </div>
      )}
      <label className="grid gap-[4px] text-body font-semibold text-text-muted">
        {t("refL")}
        <input
          dir="ltr"
          value={reference}
          placeholder={t("refPh")}
          onChange={(e) => setReference(e.target.value)}
          className="num h-[44px] rounded-control border border-border-strong bg-surface px-[14px] text-start text-land-lead text-text outline-none focus:border-brand"
        />
      </label>
      <label className="grid gap-[4px] text-body font-semibold text-text-muted">
        {t("amountL")}
        <input
          dir="ltr"
          inputMode="decimal"
          value={paid}
          onChange={(e) => setPaid(e.target.value.replace(/[^\d.]/g, ""))}
          className="num h-[44px] rounded-control border border-border-strong bg-surface px-[14px] text-start text-land-lead text-text outline-none focus:border-brand"
        />
      </label>
      <button
        type="submit"
        disabled={!valid || busy}
        aria-busy={busy}
        className={cn(
          "flex min-h-[44px] items-center justify-center gap-[10px] rounded-card border-0 text-lead font-semibold",
          valid && !busy
            ? "cursor-pointer bg-brand text-on-brand"
            : "cursor-not-allowed bg-border text-text-muted",
        )}
      >
        {busy && <Spinner />}
        {t("sendTransferBtn")}
      </button>
      {error && (
        <div
          role="alert"
          className="rounded-control bg-danger-bg px-[14px] py-[12px] font-medium text-danger-text"
        >
          {error}
        </div>
      )}
    </form>
  );
}
