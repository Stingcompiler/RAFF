"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";

import { cart } from "./cart";
import { BUTTON } from "./ProductTile";
import type { Product } from "./types";

const MINUS = "−";
const PLUS = "+";

export function AddToCart({ product }: { product: Product }) {
  const t = useTranslations("store");
  const toast = useToast();
  const [qty, setQty] = useState(1);
  if (product.rx) {
    return (
      <Link
        href={`/checkout?rx=${product.slug}`}
        className={cn(
          "inline-flex min-h-[48px] items-center rounded-control px-[20px] font-semibold no-underline",
          BUTTON.outline,
        )}
      >
        {t("requestReview")}
      </Link>
    );
  }
  if (product.availability === "unavailable") {
    return (
      <button
        type="button"
        onClick={() => toast.push("warn", t("unavailableToast"))}
        className={cn(
          "min-h-[48px] cursor-pointer rounded-control px-[20px] font-semibold",
          BUTTON.muted,
        )}
      >
        {t("add")}
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-[12px]">
      <span className="flex items-center overflow-hidden rounded-control border border-border-strong bg-surface">
        <button
          type="button"
          aria-label={t("decrease")}
          onClick={() => setQty((q) => Math.max(1, q - 1))}
          className="type-inherit grid h-[48px] w-[44px] cursor-pointer place-items-center border-0 bg-transparent text-[20px] text-text"
        >
          {MINUS}
        </button>
        <span dir="ltr" aria-label={t("qty")} className="w-[44px] text-center font-semibold">
          {qty}
        </span>
        <button
          type="button"
          aria-label={t("increase")}
          onClick={() => setQty((q) => Math.min(20, q + 1))}
          className="type-inherit grid h-[48px] w-[44px] cursor-pointer place-items-center border-0 bg-transparent text-[20px] text-text"
        >
          {PLUS}
        </button>
      </span>
      <button
        type="button"
        onClick={() => {
          cart.add(product.slug, qty);
          toast.push("success", t("added"));
        }}
        className={cn(
          "min-h-[48px] cursor-pointer rounded-control px-[20px] text-[16px] font-semibold",
          BUTTON.solid,
        )}
      >
        {t("add")}
      </button>
    </div>
  );
}
