"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";

import { Spinner } from "@/components/ui/Spinner";
import { apiSend } from "@/lib/api/browser";
import { cn } from "@/lib/cn";

import { PHONE, waLink } from "./types";

const TOPICS = ["medicine", "order", "availability", "other"] as const;
const VIAS = ["whatsapp", "call"] as const;
const TIMEOUT_MS = 15000;
const MAX_MESSAGE = 1000;

type Sent = { number: string };

const FIELD =
  "h-[44px] rounded-control border border-border-strong bg-surface px-[14px] text-start text-land-lead text-text outline-none focus:border-brand focus:shadow-[0_0_0_2px_var(--color-surface),0_0_0_4px_var(--color-focus)]";

/** The contact page's question form: who is asking, how to reach them, and what about. */
export function InquiryForm({ whatsapp }: { whatsapp: string }) {
  const t = useTranslations("store");
  const locale = useLocale();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [topic, setTopic] = useState<(typeof TOPICS)[number]>("medicine");
  const [orderNo, setOrderNo] = useState("");
  const [via, setVia] = useState<(typeof VIAS)[number]>("whatsapp");
  const [message, setMessage] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);

  const phoneOk = PHONE.test(phone.replace(/\s/g, ""));
  const orderOk = topic !== "order" || orderNo.trim().length > 0;
  const valid = name.trim().length > 1 && phoneOk && orderOk && message.trim().length > 2 && agree;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    const k = key ?? crypto.randomUUID();
    setKey(k);
    setBusy(true);
    setError(null);
    const res = await apiSend<Sent>(
      "POST",
      "/public/inquiries/",
      {
        name,
        phone,
        topic,
        via,
        order_number: topic === "order" ? orderNo : "",
        message,
        locale,
        agree,
      },
      { idempotencyKey: k, timeoutMs: TIMEOUT_MS },
    );
    setBusy(false);
    if (res.ok) {
      setSent(res.data);
      return;
    }
    // A network failure keeps the key so a retry cannot send twice; a refusal starts afresh.
    if (res.status !== 0) setKey(null);
    setError(res.status === 429 ? t("rateLimited") : t("inqFail"));
  };

  const again = () => {
    setSent(null);
    setKey(null);
    setMessage("");
    setAgree(false);
  };

  if (sent) {
    return (
      <div
        role="status"
        className="grid gap-[12px] rounded-panel border border-success-border bg-success-bg p-[24px] text-success-text"
      >
        <div className="text-lead font-semibold">{t("inqDone")}</div>
        <div>{t("inqDoneB", { number: sent.number, via: t(`via.${via}`) })}</div>
        {whatsapp && (
          <a
            href={waLink(whatsapp, t("inqWaText", { number: sent.number, message }))}
            className="inline-flex min-h-[44px] items-center font-semibold text-brand underline underline-offset-4"
          >
            {t("inqWa")}
          </a>
        )}
        <button
          type="button"
          onClick={again}
          className="min-h-[44px] cursor-pointer rounded-control border border-border-strong bg-surface px-[14px] font-medium text-text"
        >
          {t("inqAnother")}
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="grid grid-cols-[minmax(0,1fr)] gap-x-[16px] gap-y-[16px] rounded-panel border border-border bg-surface p-[24px] min-[640px]:grid-cols-2 max-[760px]:p-[18px]"
    >
      <div className="grid gap-[4px] min-[640px]:col-span-2">
        <h2 className="m-0 text-land-section font-semibold">{t("inqT")}</h2>
        <p className="m-0 text-text-secondary">{t("inqB")}</p>
      </div>
      <label className="grid gap-[4px] text-body font-semibold text-text-muted">
        {t("nameL")}
        <input
          value={name}
          autoComplete="name"
          onChange={(e) => setName(e.target.value)}
          className={FIELD}
        />
      </label>
      <label className="grid gap-[4px] text-body font-semibold text-text-muted">
        {t("phoneL")}
        <input
          dir="ltr"
          inputMode="tel"
          autoComplete="tel"
          placeholder="09XXXXXXXX"
          value={phone}
          aria-invalid={phone !== "" && !phoneOk}
          onChange={(e) => setPhone(e.target.value)}
          className={cn(FIELD, "num", phone !== "" && !phoneOk && "border-danger-solid")}
        />
        {phone !== "" && !phoneOk && (
          <span className="text-label font-medium text-danger-text">{t("phoneErr")}</span>
        )}
      </label>
      <label
        className={cn(
          "grid gap-[4px] text-body font-semibold text-text-muted",
          topic !== "order" && "min-[640px]:col-span-2",
        )}
      >
        {t("topicL")}
        <select
          value={topic}
          onChange={(e) => setTopic(e.target.value as (typeof TOPICS)[number])}
          className={cn(FIELD, "cursor-pointer")}
        >
          {TOPICS.map((v) => (
            <option key={v} value={v}>
              {t(`topic.${v}`)}
            </option>
          ))}
        </select>
      </label>
      {topic === "order" && (
        <label className="grid gap-[4px] text-body font-semibold text-text-muted">
          {t("orderNoL")}
          <input
            dir="ltr"
            placeholder="O-0000"
            value={orderNo}
            onChange={(e) => setOrderNo(e.target.value)}
            className={cn(FIELD, "num")}
          />
          {orderNo !== "" && !orderOk && (
            <span className="text-label font-medium text-danger-text">{t("orderNoErr")}</span>
          )}
        </label>
      )}
      <fieldset className="m-0 grid gap-[6px] border-0 p-0 min-[640px]:col-span-2">
        <legend className="mb-[6px] p-0 text-body font-semibold text-text-muted">
          {t("viaL")}
        </legend>
        <div className="flex flex-wrap gap-[8px]">
          {VIAS.map((v) => (
            <label
              key={v}
              className={cn(
                "flex min-h-[44px] flex-1 cursor-pointer items-center justify-center gap-[8px] rounded-control border px-[12px] font-medium",
                via === v
                  ? "border-brand bg-brand-subtle/40 text-brand"
                  : "border-border-strong bg-surface text-text",
              )}
            >
              <input
                type="radio"
                name="via"
                value={v}
                checked={via === v}
                onChange={() => setVia(v)}
                className="m-0 size-[18px] accent-brand"
              />
              {t(`via.${v}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="grid gap-[4px] text-body font-semibold text-text-muted min-[640px]:col-span-2">
        {t("messageL")}
        <textarea
          rows={4}
          maxLength={MAX_MESSAGE}
          value={message}
          placeholder={t("messagePh")}
          onChange={(e) => setMessage(e.target.value)}
          className="resize-y rounded-control border border-border-strong bg-surface px-[14px] py-[12px] text-lead text-text outline-none focus:border-brand"
        />
        <span className="text-label font-normal">{t("noHealth")}</span>
      </label>
      <label className="flex min-h-[44px] cursor-pointer items-center gap-[10px] min-[640px]:col-span-2">
        <input
          type="checkbox"
          checked={agree}
          onChange={(e) => setAgree(e.target.checked)}
          className="m-0 size-[22px] flex-none accent-brand"
        />
        <span>
          {t("agree")}
          <Link href="/policies/privacy" target="_blank" className="text-brand underline">
            {t("policy")}
          </Link>
        </span>
      </label>
      <button
        type="submit"
        disabled={!valid || busy}
        aria-busy={busy}
        className={cn(
          "flex min-h-[48px] items-center justify-center gap-[10px] rounded-card border-0 text-lead font-semibold min-[640px]:col-span-2",
          valid && !busy
            ? "cursor-pointer bg-brand text-on-brand"
            : "cursor-not-allowed bg-border text-text-muted",
        )}
      >
        {busy && <Spinner />}
        {busy ? t("inqSending") : t("inqSend")}
      </button>
      {error && (
        <div
          role="alert"
          className="rounded-control bg-danger-bg px-[14px] py-[12px] font-medium text-danger-text min-[640px]:col-span-2"
        >
          {error}
        </div>
      )}
    </form>
  );
}
