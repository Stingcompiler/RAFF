"use client";

import { Home, Landmark, MapPin, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { type ComponentType, type FormEvent, useState } from "react";

import { StoreIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/Spinner";
import { apiGet, apiSend } from "@/lib/api/browser";
import { cn } from "@/lib/cn";
import { multiply, sum } from "@/lib/decimal";
import { money } from "@/lib/format";

import { cart, useCart } from "./cart";
import { PHONE, productName, type Store } from "./types";
import { useProducts } from "./useProducts";

type Placed = { number: string; token: string; status: string };
type Phase = "idle" | "sending" | "verifying" | "failed";
const TIMEOUT_MS = 15000;
const TIMES = "×";
const MIN_ADDRESS = 3;
const MIN_REFERENCE = 4;
const LOCATE_MS = 10000;
const DECIMALS = 6;

/** Send the order (§4.5): idle, sending (disabled), timeout → verify by the fixed key, failure keeps data. */
export function CheckoutScreen({ store }: { store: Store }) {
  const t = useTranslations("store");
  const ar = useLocale() === "ar";
  const router = useRouter();
  const rx = useSearchParams().get("rx");
  const lines = useCart();
  const { bySlug, ready } = useProducts();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [address, setAddress] = useState("");
  const [position, setPosition] = useState<{ lat: string; lng: string } | null>(null);
  const [locating, setLocating] = useState<"idle" | "busy" | "denied">("idle");
  const [agree, setAgree] = useState(false);
  const [fulfillment, setFulfillment] = useState<"pickup" | "delivery">("pickup");
  const [payment, setPayment] = useState<"cod" | "bank">("cod");
  const [payNow, setPayNow] = useState(true);
  const [reference, setReference] = useState("");
  const [paid, setPaid] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);

  const wanted = rx && !lines.some((l) => l.slug === rx) ? [...lines, { slug: rx, qty: 1 }] : lines;
  const rows = wanted
    .map((l) => ({ line: l, product: bySlug.get(l.slug) }))
    .filter((r) => r.product);
  const estimate = sum(
    rows.map(({ line, product }) => (product?.price ? multiply(product.price, line.qty) : "0")),
  );
  const phoneOk = PHONE.test(phone.replace(/\s/g, ""));
  const addressOk = address.trim().length >= MIN_ADDRESS;
  // Prescription items and items without a price are reviewed at the counter: pickup, and
  // paying at pickup, only.
  const needsReview = rows.some(({ product }) => product?.rx || !product?.price);
  const showDelivery = store.delivery_enabled;
  const showBank = store.prepay_enabled;
  const amountValue = paid ?? estimate.replace(/\.0+$/, "");
  const sendsTransfer = payment === "bank" && payNow;
  const refOk = reference.replace(/\s/g, "").length >= MIN_REFERENCE;
  const amountOk = Number(amountValue) > 0;
  const payOk = !sendsTransfer || (refOk && amountOk);
  const valid = name.trim().length > 1 && phoneOk && addressOk && payOk && agree && rows.length > 0;
  const busy = phase === "sending" || phase === "verifying";

  const done = (placed: Placed) => {
    cart.clear();
    router.push(`/orders/${placed.token}`);
  };

  const verify = async (k: string) => {
    const res = await apiGet<Placed>(`/public/orders/by-key/${k}/`);
    if (res.ok) return done(res.data);
    if (res.status === 404) {
      setPhase("failed");
      setError(t("failMsg"));
    }
  };

  const locate = () => {
    if (!("geolocation" in navigator)) return setLocating("denied");
    setLocating("busy");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({
          lat: pos.coords.latitude.toFixed(DECIMALS),
          lng: pos.coords.longitude.toFixed(DECIMALS),
        });
        setLocating("idle");
      },
      () => setLocating("denied"),
      { enableHighAccuracy: true, timeout: LOCATE_MS, maximumAge: 60000 },
    );
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    const k = key ?? crypto.randomUUID();
    setKey(k);
    setPhase("sending");
    setError(null);
    const res = await apiSend<Placed>(
      "POST",
      "/public/orders/",
      {
        name,
        phone,
        note,
        address,
        fulfillment,
        payment_method: payment,
        payment_reference: sendsTransfer ? reference.trim() : "",
        paid_amount: sendsTransfer ? amountValue : null,
        latitude: position?.lat ?? null,
        longitude: position?.lng ?? null,
        agree,
        lines: rows.map(({ line }) => ({ slug: line.slug, quantity: line.qty })),
      },
      { idempotencyKey: k, timeoutMs: TIMEOUT_MS },
    );
    if (res.ok) return done(res.data);
    if (res.status === 0) {
      setPhase("verifying");
      return void verify(k);
    }
    setPhase("failed");
    setKey(null);
    const code = typeof res.error?.detail === "string" ? res.error.detail : "";
    setError(
      res.status === 429
        ? t("rateLimited")
        : code === "store_closed"
          ? t("storeClosed")
          : code === "reference_used"
            ? t("refUsed")
            : /^(delivery|prepay)_/.test(code)
              ? t("optionGone")
              : t("failMsg"),
    );
  };

  const choice = (
    group: "fulfillment" | "payment",
    value: string,
    Icon: ComponentType<{ size?: number; className?: string }>,
    title: string,
    hint: string,
    available: boolean,
    unavailable = "",
  ) => {
    const on = (group === "fulfillment" ? fulfillment : payment) === value;
    return (
      <label
        key={value}
        className={cn(
          "flex min-h-[64px] items-center gap-[12px] rounded-card border-2 bg-surface p-[14px]",
          on ? "border-brand" : "border-border",
          available ? "cursor-pointer" : "cursor-not-allowed opacity-60",
        )}
      >
        <input
          type="radio"
          name={group}
          value={value}
          checked={on}
          disabled={!available}
          onChange={() =>
            group === "fulfillment"
              ? setFulfillment(value as "pickup" | "delivery")
              : setPayment(value as "cod" | "bank")
          }
          className="m-0 size-[18px] flex-none accent-brand"
        />
        <Icon size={26} aria-hidden="true" className="flex-none text-brand" />
        <span className="grid gap-[2px]">
          <span className="font-semibold">{title}</span>
          <span className="text-body text-text-muted">{available ? hint : unavailable}</span>
        </span>
      </label>
    );
  };

  return (
    <section className="grid grid-cols-[repeat(auto-fit,minmax(min(340px,100%),1fr))] items-start gap-[24px] px-[20px] pt-[24px] pb-[40px]">
      <form onSubmit={submit} className="grid grid-cols-[minmax(0,1fr)] gap-[14px]" noValidate>
        <h1 className="m-0 text-land-section font-semibold">{t("send")}</h1>
        <label className="grid gap-[4px] text-body font-semibold text-text-muted">
          {t("nameL")}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            className="h-[44px] rounded-control border border-border-strong bg-surface px-[14px] text-land-lead text-text outline-none focus:border-brand focus:shadow-[0_0_0_2px_var(--color-surface),0_0_0_4px_var(--color-focus)]"
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
            className={cn(
              "h-[44px] rounded-control border bg-surface px-[14px] text-start text-land-lead text-text outline-none focus:shadow-[0_0_0_2px_var(--color-surface),0_0_0_4px_var(--color-focus)]",
              phone !== "" && !phoneOk
                ? "border-danger-solid"
                : "border-border-strong focus:border-brand",
              "num",
            )}
          />
          {phone !== "" && !phoneOk && (
            <span className="text-label font-medium text-danger-text">{t("phoneErr")}</span>
          )}
        </label>
        <div className="grid gap-[6px]">
          <label className="grid gap-[4px] text-body font-semibold text-text-muted">
            {t("locL")}
            <textarea
              rows={2}
              value={address}
              maxLength={300}
              autoComplete="street-address"
              placeholder={t("locPh")}
              aria-invalid={address !== "" && !addressOk}
              onChange={(e) => setAddress(e.target.value)}
              className={cn(
                "resize-y rounded-control border bg-surface px-[14px] py-[12px] text-lead text-text outline-none focus:border-brand",
                address !== "" && !addressOk ? "border-danger-solid" : "border-border-strong",
              )}
            />
            <span className="text-label font-normal">{t("locHelp")}</span>
            {address !== "" && !addressOk && (
              <span className="text-label font-medium text-danger-text">{t("locErr")}</span>
            )}
          </label>
          {position ? (
            <div className="flex min-h-[44px] flex-wrap items-center justify-between gap-[8px] rounded-control bg-success-bg px-[14px] py-[8px] font-medium text-success-text">
              <span>{t("locOk")}</span>
              <button
                type="button"
                onClick={() => setPosition(null)}
                className="min-h-[44px] cursor-pointer border-0 bg-transparent px-[8px] font-medium text-success-text underline"
              >
                {t("locClear")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={locate}
              disabled={locating === "busy"}
              className="flex min-h-[44px] cursor-pointer items-center justify-center gap-[8px] rounded-control border border-border-strong bg-surface px-[14px] font-medium text-text disabled:cursor-progress"
            >
              {locating === "busy" ? <Spinner /> : <MapPin size={18} aria-hidden="true" />}
              {locating === "busy" ? t("locBusy") : t("locUse")}
            </button>
          )}
          {locating === "denied" && !position && (
            <span role="alert" className="text-label font-medium text-danger-text">
              {t("locDenied")}
            </span>
          )}
        </div>
        <fieldset className="m-0 grid gap-[8px] border-0 p-0">
          <legend className="mb-[6px] p-0 text-body font-semibold text-text-muted">
            {t("pickupL")}
          </legend>
          {choice("fulfillment", "pickup", StoreIcon, t("pickup"), t("pickupD"), true)}
          {showDelivery &&
            choice(
              "fulfillment",
              "delivery",
              Home,
              t("homeOpt"),
              t("homeD"),
              !needsReview,
              t("homeRx"),
            )}
        </fieldset>
        {showBank && (
          <fieldset className="m-0 grid gap-[8px] border-0 p-0">
            <legend className="mb-[6px] p-0 text-body font-semibold text-text-muted">
              {t("payL")}
            </legend>
            {choice("payment", "cod", Wallet, t("cod"), t("codD"), true)}
            {choice(
              "payment",
              "bank",
              Landmark,
              t("bankOpt"),
              t("bankD"),
              !needsReview,
              t("bankRx"),
            )}
            {payment === "bank" && (
              <div className="grid gap-[12px] rounded-card border border-border bg-surface p-[14px]">
                <div className="grid gap-[4px]">
                  <div className="text-label font-semibold text-text-muted">
                    {t("bankAccounts")}
                  </div>
                  <div className="whitespace-pre-wrap">{store.bank_accounts}</div>
                </div>
                <div className="flex flex-wrap gap-[8px]">
                  {[true, false].map((now) => (
                    <label
                      key={String(now)}
                      className={cn(
                        "flex min-h-[44px] flex-1 cursor-pointer items-center justify-center gap-[8px] rounded-control border px-[12px] font-medium",
                        payNow === now
                          ? "border-brand bg-brand-subtle/40 text-brand"
                          : "border-border-strong bg-surface text-text",
                      )}
                    >
                      <input
                        type="radio"
                        name="paynow"
                        checked={payNow === now}
                        onChange={() => setPayNow(now)}
                        className="m-0 size-[18px] accent-brand"
                      />
                      {now ? t("payNow") : t("payLater")}
                    </label>
                  ))}
                </div>
                {payNow && (
                  <>
                    <label className="grid gap-[4px] text-body font-semibold text-text-muted">
                      {t("refL")}
                      <input
                        dir="ltr"
                        value={reference}
                        placeholder={t("refPh")}
                        aria-invalid={reference !== "" && !refOk}
                        onChange={(e) => setReference(e.target.value)}
                        className={cn(
                          "h-[44px] rounded-control border bg-surface px-[14px] text-start text-land-lead text-text outline-none focus:border-brand",
                          reference !== "" && !refOk
                            ? "border-danger-solid"
                            : "border-border-strong",
                          "num",
                        )}
                      />
                      {reference !== "" && !refOk && (
                        <span className="text-label font-medium text-danger-text">
                          {t("refErr")}
                        </span>
                      )}
                    </label>
                    <label className="grid gap-[4px] text-body font-semibold text-text-muted">
                      {t("amountL")}
                      <input
                        dir="ltr"
                        inputMode="decimal"
                        value={amountValue}
                        onChange={(e) => setPaid(e.target.value.replace(/[^\d.]/g, ""))}
                        className="h-[44px] rounded-control border border-border-strong bg-surface px-[14px] text-start text-land-lead text-text outline-none focus:border-brand num"
                      />
                    </label>
                  </>
                )}
                <div className="text-label text-text-muted">{t("payHint")}</div>
              </div>
            )}
          </fieldset>
        )}
        <label className="grid gap-[4px] text-body font-semibold text-text-muted">
          {t("noteL")}
          <textarea
            rows={3}
            value={note}
            placeholder={t("notePh")}
            onChange={(e) => setNote(e.target.value)}
            className="resize-y rounded-control border border-border-strong bg-surface px-[14px] py-[12px] text-lead text-text outline-none focus:border-brand"
          />
          <span className="text-label font-normal">{t("noHealth")}</span>
        </label>
        <label className="flex min-h-[44px] cursor-pointer items-center gap-[10px]">
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
            "flex min-h-[44px] items-center justify-center gap-[10px] rounded-card border-0 text-lead font-semibold",
            valid && !busy
              ? "cursor-pointer bg-brand text-on-brand"
              : busy
                ? "cursor-progress bg-border text-text-muted"
                : "cursor-not-allowed bg-border text-text-muted",
          )}
        >
          {busy && <Spinner />}
          {busy ? t("sending") : t("send")}
        </button>
        {phase === "failed" && error && (
          <div
            role="alert"
            className="rounded-control bg-danger-bg px-[14px] py-[12px] font-medium text-danger-text"
          >
            {error}
          </div>
        )}
        {phase === "verifying" && key && (
          <div
            role="status"
            className="grid gap-[4px] rounded-control bg-info-bg px-[14px] py-[12px] font-medium text-info-text"
          >
            <span>{t("toMsg")}</span>
            <span className="text-label font-normal">
              {t("reqL")}{" "}
              <bdi dir="ltr" className="font-semibold num">
                {key.slice(0, 8).toUpperCase()}
              </bdi>
            </span>
          </div>
        )}
      </form>
      <aside className="grid gap-[10px] rounded-card border border-border bg-surface p-[18px]">
        <div className="font-semibold">{t("summary")}</div>
        {ready &&
          rows.map(({ line, product }) =>
            product ? (
              <div key={line.slug} className="flex justify-between gap-[12px] text-land-body">
                <span>
                  {productName(ar, product)}{" "}
                  <span dir="ltr" className="text-text-muted num">
                    {[TIMES, line.qty].join(" ")}
                  </span>
                </span>
                <span dir="ltr" className="num">
                  {product.price
                    ? money(multiply(product.price, line.qty), ar ? "ar" : "en")
                    : t("pharmacistReview")}
                </span>
              </div>
            ) : null,
          )}
        <div className="flex justify-between border-t border-border pt-[10px] font-semibold">
          <span>{t("est")}</span>
          <span className="num" dir="ltr">
            {money(estimate, ar ? "ar" : "en") || money("0", ar ? "ar" : "en")}
          </span>
        </div>
        <div className="text-label text-text-muted">{t("sumNote")}</div>
      </aside>
    </section>
  );
}
