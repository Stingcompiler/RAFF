"use client";

import { MapPin, Phone } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useCallback, useEffect, useState } from "react";

import { BrandMark } from "@/components/ui/icons";
import { StaleNote } from "@/components/ui/StaleNote";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Textarea } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { apiGet, apiSend } from "@/lib/api/browser";
import { money } from "@/lib/format";
import { waLink } from "@/lib/whatsapp";

import type { DeliveryCard } from "./types";

const REFRESH_MS = 30000;
const DECIMALS = /\.0+$/;

/** The courier's list: take an order, then report it delivered (with the cash) or failed. */
export function DeliveriesScreen({ initial, name }: { initial: DeliveryCard[]; name: string }) {
  const t = useTranslations("deliveries");
  const ar = useLocale() === "ar";
  const toast = useToast();
  const [cards, setCards] = useState(initial);
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [handing, setHanding] = useState<DeliveryCard | null>(null);
  const [failing, setFailing] = useState<DeliveryCard | null>(null);
  const [collected, setCollected] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const cur = (v: string) => money(v, ar ? "ar" : "en");

  const reload = useCallback(async () => {
    const res = await apiGet<DeliveryCard[]>("/deliveries/");
    setStale(!res.ok);
    if (res.ok) setCards(res.data);
  }, []);
  useEffect(() => {
    const timer = setInterval(() => void reload(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [reload]);

  const act = async (card: DeliveryCard, action: string, body: object = {}) => {
    setBusy(card.id);
    const res = await apiSend<DeliveryCard>("POST", `/deliveries/${card.id}/${action}/`, body);
    setBusy(null);
    if (!res.ok) {
      toast.push("danger", t("failed"));
      return false;
    }
    setCards((all) => all.map((c) => (c.id === card.id ? res.data : c)));
    return true;
  };

  const handOver = async (e: FormEvent) => {
    e.preventDefault();
    if (!handing) return;
    const body =
      handing.payment_method === "cod" ? { collected: collected || "0", note } : { note };
    if (await act(handing, "deliver", body)) {
      setHanding(null);
      setNote("");
    }
  };

  const fail = async (e: FormEvent) => {
    e.preventDefault();
    if (failing && (await act(failing, "fail", { reason }))) {
      setFailing(null);
      setReason("");
    }
  };

  const map = (c: DeliveryCard) =>
    c.latitude && c.longitude
      ? `https://www.google.com/maps?q=${c.latitude},${c.longitude}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address)}`;

  return (
    <main className="mx-auto grid min-h-dvh max-w-[560px] content-start gap-[12px] bg-canvas px-[16px] pt-[12px] pb-[32px] text-text">
      <header className="flex items-center justify-between gap-[12px] pb-[4px]">
        <span className="flex items-center gap-[8px] text-lead font-bold text-brand">
          <BrandMark />
          {t("title")}
        </span>
        <span className="text-label text-text-muted">{name}</span>
      </header>
      <StaleNote show={stale} />
      {cards.length === 0 && (
        <div className="rounded-card border border-border bg-surface p-[24px] text-center text-text-muted">
          {t("empty")}
        </div>
      )}
      {cards.map((c) => (
        <article
          key={c.id}
          data-testid="delivery-card"
          className="grid gap-[10px] rounded-card border border-border bg-surface p-[14px]"
        >
          <div className="flex items-center justify-between gap-[8px]">
            <bdi dir="ltr" className="font-semibold num">
              {c.number}
            </bdi>
            <span className="rounded-pill border border-border px-[8px] py-[1px] text-caption font-medium">
              {t(`status.${c.status}`)}
            </span>
          </div>
          <div className="font-semibold">{c.customer_name}</div>
          <div className="flex gap-[8px]">
            <a
              href={`tel:${c.phone}`}
              className="flex min-h-[44px] flex-1 items-center justify-center gap-[6px] rounded-control border border-border-strong font-medium text-text no-underline"
            >
              <Phone size={16} aria-hidden="true" />
              <bdi dir="ltr" className="num">
                {c.phone}
              </bdi>
            </a>
            <a
              href={waLink(c.phone)}
              className="flex min-h-[44px] items-center justify-center rounded-control border border-border-strong px-[12px] font-medium text-text no-underline"
            >
              {t("whatsapp")}
            </a>
          </div>
          <a
            href={map(c)}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-[44px] items-start gap-[8px] text-text no-underline"
          >
            <MapPin size={18} aria-hidden="true" className="mt-[2px] flex-none text-brand" />
            <span className="whitespace-pre-wrap">{c.address || t("noAddress")}</span>
          </a>
          {c.note && <div className="text-label text-text-muted">{c.note}</div>}
          <div className="flex flex-wrap justify-between gap-[8px] text-label text-text-muted">
            <span>{t("items", { count: c.lines_count })}</span>
            {c.payment_method === "cod" && c.amount_due ? (
              <span data-testid="amount-due" className="font-semibold text-text">
                {t("collect", { amount: cur(c.amount_due) })}
              </span>
            ) : (
              <span className="font-semibold text-success-text">{t("prepaid")}</span>
            )}
          </div>
          {c.status === "ready" && (
            <Button size="lg" disabled={busy === c.id} onClick={() => void act(c, "pickup")}>
              {t("pickup")}
            </Button>
          )}
          {c.status === "out_for_delivery" && (
            <div className="flex gap-[8px]">
              <Button
                size="lg"
                className="flex-1"
                onClick={() => {
                  setHanding(c);
                  setCollected(c.amount_due ? c.amount_due.replace(DECIMALS, "") : "");
                }}
              >
                {t("delivered")}
              </Button>
              <Button variant="outline" size="lg" onClick={() => setFailing(c)}>
                {t("failedBtn")}
              </Button>
            </div>
          )}
          {c.status === "delivered" && (
            <div
              role="status"
              className="rounded-control bg-success-bg px-[12px] py-[10px] font-medium text-success-text"
            >
              {c.collected_amount
                ? t("handCash", { amount: cur(c.collected_amount) })
                : t("doneNoCash")}
            </div>
          )}
          {c.status === "delivery_failed" && (
            <div
              role="status"
              className="rounded-control bg-danger-bg px-[12px] py-[10px] font-medium text-danger-text"
            >
              {t("failedNote", { reason: c.reason })}
            </div>
          )}
        </article>
      ))}
      <Dialog
        open={handing !== null}
        onClose={busy ? undefined : () => setHanding(null)}
        labelledBy="hand-title"
      >
        <form onSubmit={handOver} className="grid gap-[12px]">
          <div id="hand-title" className="text-lead font-medium">
            {t("handTitle", { number: handing?.number ?? "" })}
          </div>
          {handing?.payment_method === "cod" && (
            <label className="grid gap-[4px] type-label text-text-secondary">
              {t("collectedL")}
              <input
                dir="ltr"
                inputMode="decimal"
                value={collected}
                onChange={(e) => setCollected(e.target.value.replace(/[^\d.]/g, ""))}
                className="num h-[44px] rounded-control border-2 border-brand bg-canvas px-[12px] text-lead text-text outline-none"
              />
            </label>
          )}
          <label className="grid gap-[4px] type-label text-text-secondary">
            {t("noteL")}
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="flex justify-end gap-[8px]">
            <Button variant="outline" size="lg" onClick={() => setHanding(null)}>
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              size="lg"
              disabled={busy !== null || (handing?.payment_method === "cod" && collected === "")}
            >
              {t("confirm")}
            </Button>
          </div>
        </form>
      </Dialog>
      <Dialog
        open={failing !== null}
        onClose={busy ? undefined : () => setFailing(null)}
        labelledBy="fail-title"
      >
        <form onSubmit={fail} className="grid gap-[12px]">
          <div id="fail-title" className="text-lead font-medium">
            {t("failTitle", { number: failing?.number ?? "" })}
          </div>
          <label className="grid gap-[4px] type-label text-text-secondary">
            {t("reasonL")}
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <div className="flex justify-end gap-[8px]">
            <Button variant="outline" size="lg" onClick={() => setFailing(null)}>
              {t("cancel")}
            </Button>
            <Button type="submit" size="lg" disabled={busy !== null || !reason.trim()}>
              {t("confirm")}
            </Button>
          </div>
        </form>
      </Dialog>
    </main>
  );
}
