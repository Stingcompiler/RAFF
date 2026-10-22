"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";

import { StoreIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/Spinner";
import { apiGet, apiSend } from "@/lib/api/browser";
import { cn } from "@/lib/cn";
import { multiply, sum } from "@/lib/decimal";
import { money } from "@/lib/format";

import { cart, useCart } from "./cart";
import { PHONE, productName } from "./types";
import { useProducts } from "./useProducts";

type Placed = { number: string; token: string; status: string };
type Phase = "idle" | "sending" | "verifying" | "failed";
const TIMEOUT_MS = 15000;
const TIMES = "×";

/** Send the order (§4.5): idle, sending (disabled), timeout → verify by the fixed key, failure keeps data. */
export function CheckoutScreen() {
  const t = useTranslations("store");
  const ar = useLocale() === "ar";
  const router = useRouter();
  const rx = useSearchParams().get("rx");
  const lines = useCart();
  const { bySlug, ready } = useProducts();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [agree, setAgree] = useState(false);
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
  const valid = name.trim().length > 1 && phoneOk && agree && rows.length > 0;
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
          : t("failMsg"),
    );
  };

  return (
    <section className="grid grid-cols-[repeat(auto-fit,minmax(min(340px,100%),1fr))] items-start gap-[24px] px-[20px] pt-[24px] pb-[40px]">
      <form onSubmit={submit} className="grid gap-[14px]" noValidate>
        <h1 className="m-0 text-[30px] font-semibold">{t("send")}</h1>
        <label className="grid gap-[4px] text-[14px] font-semibold text-muted">
          {t("nameL")}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            className="h-[52px] rounded-[10px] border border-line-strong bg-surface px-[14px] text-[17px] text-ink outline-none focus:border-brand focus:shadow-[0_0_0_3px_var(--color-focus)]"
          />
        </label>
        <label className="grid gap-[4px] text-[14px] font-semibold text-muted">
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
              "h-[52px] rounded-[10px] border bg-surface px-[14px] text-start text-[17px] text-ink outline-none focus:shadow-[0_0_0_3px_var(--color-focus)]",
              phone !== "" && !phoneOk ? "border-danger" : "border-line-strong focus:border-brand",
            )}
          />
          {phone !== "" && !phoneOk && (
            <span className="text-[13px] font-medium text-danger">{t("phoneErr")}</span>
          )}
        </label>
        <div className="grid gap-[6px]">
          <div className="text-[14px] font-semibold text-muted">{t("pickupL")}</div>
          <div className="flex items-center gap-[12px] rounded-[12px] border-2 border-brand bg-surface p-[14px]">
            <StoreIcon size={26} className="flex-none text-brand" />
            <div>
              <div className="font-semibold">{t("pickup")}</div>
              <div className="text-[14px] text-muted">{t("payPickup")}</div>
            </div>
          </div>
        </div>
        <label className="grid gap-[4px] text-[14px] font-semibold text-muted">
          {t("noteL")}
          <textarea
            rows={3}
            value={note}
            placeholder={t("notePh")}
            onChange={(e) => setNote(e.target.value)}
            className="resize-y rounded-[10px] border border-line-strong bg-surface px-[14px] py-[12px] text-[16px] text-ink outline-none focus:border-brand"
          />
          <span className="text-[13px] font-normal">{t("noHealth")}</span>
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
            "flex min-h-[52px] items-center justify-center gap-[10px] rounded-[12px] border-0 text-[16px] font-semibold",
            valid && !busy
              ? "cursor-pointer bg-brand text-brand-ink"
              : busy
                ? "cursor-progress bg-line text-muted"
                : "cursor-not-allowed bg-line text-muted",
          )}
        >
          {busy && <Spinner />}
          {busy ? t("sending") : t("send")}
        </button>
        {phase === "failed" && error && (
          <div
            role="alert"
            className="rounded-[10px] bg-danger-bg px-[14px] py-[12px] font-medium text-danger"
          >
            {error}
          </div>
        )}
        {phase === "verifying" && key && (
          <div
            role="status"
            className="grid gap-[4px] rounded-[10px] bg-info-bg px-[14px] py-[12px] font-medium text-info"
          >
            <span>{t("toMsg")}</span>
            <span className="text-[13px] font-normal">
              {t("reqL")}{" "}
              <bdi dir="ltr" className="font-semibold [unicode-bidi:isolate]">
                {key.slice(0, 8).toUpperCase()}
              </bdi>
            </span>
          </div>
        )}
      </form>
      <aside className="grid gap-[10px] rounded-[14px] border border-line bg-surface p-[18px]">
        <div className="font-semibold">{t("summary")}</div>
        {ready &&
          rows.map(({ line, product }) =>
            product ? (
              <div key={line.slug} className="flex justify-between gap-[12px] text-[15px]">
                <span>
                  {productName(ar, product)}{" "}
                  <span dir="ltr" className="text-muted">
                    {[TIMES, line.qty].join(" ")}
                  </span>
                </span>
                <span dir="ltr" className="tabular-nums">
                  {product.price
                    ? money(multiply(product.price, line.qty), ar ? "ar" : "en")
                    : t("pharmacistReview")}
                </span>
              </div>
            ) : null,
          )}
        <div className="flex justify-between border-t border-line pt-[10px] font-semibold">
          <span>{t("est")}</span>
          <span dir="ltr">{money(estimate, ar ? "ar" : "en") || money("0", ar ? "ar" : "en")}</span>
        </div>
        <div className="text-[13px] text-muted">{t("sumNote")}</div>
      </aside>
    </section>
  );
}
