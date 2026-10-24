"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";

import { apiSend } from "@/lib/api/browser";

const FIELD =
  "h-[52px] rounded-control border border-border-strong bg-surface px-[14px] text-start text-land-lead text-text outline-none focus:border-brand focus:shadow-[0_0_0_2px_var(--color-surface),0_0_0_4px_var(--color-focus)]";

/** Order number + phone → the order page (the number alone never opens an order). */
export function TrackScreen() {
  const t = useTranslations("store");
  const router = useRouter();
  const [number, setNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await apiSend<{ token: string }>("POST", "/public/orders/track/", {
      number,
      phone,
    });
    setBusy(false);
    if (res.ok) router.push(`/orders/${res.data.token}`);
    else setError(true);
  };
  return (
    <section className="grid max-w-[480px] gap-[16px] px-[20px] pt-[32px] pb-[48px]">
      <h1 className="m-0 text-land-section font-semibold">{t("trackT")}</h1>
      <p className="m-0 text-text-secondary">{t("trackB")}</p>
      <form onSubmit={submit} className="grid gap-[16px]">
        <label className="grid gap-[4px] text-body font-semibold text-text-muted">
          {t("orderNo")}
          <input
            dir="ltr"
            placeholder="O-0000"
            value={number}
            onChange={(e) => {
              setNumber(e.target.value);
              setError(false);
            }}
            className={FIELD}
          />
        </label>
        <label className="grid gap-[4px] text-body font-semibold text-text-muted">
          {t("phoneL")}
          <input
            dir="ltr"
            inputMode="tel"
            placeholder="09XXXXXXXX"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setError(false);
            }}
            className={FIELD}
          />
        </label>
        <button
          type="submit"
          disabled={busy || !number || !phone}
          className="min-h-[52px] cursor-pointer rounded-card border-0 bg-brand text-lead font-semibold text-on-brand disabled:cursor-not-allowed disabled:bg-border disabled:text-text-muted"
        >
          {t("trackBtn")}
        </button>
      </form>
      {error && (
        <div
          role="alert"
          className="rounded-control bg-danger-bg px-[14px] py-[12px] font-medium text-danger-text"
        >
          {t("trackErr")}
        </div>
      )}
    </section>
  );
}
