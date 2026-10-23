"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Dialog } from "@/components/ui/Dialog";
import { apiGet } from "@/lib/api/browser";
import { money, timeOfDay } from "@/lib/format";

import { type HeldSale, pick } from "./types";

const ESC = "Esc";
const SEP = " · ";

type Props = { onClose: () => void; onResume: (held: HeldSale) => void };

export function HeldDialog({ onClose, onResume }: Props) {
  const t = useTranslations("pos");
  const ar = useLocale() === "ar";
  const [rows, setRows] = useState<HeldSale[] | null>(null);

  useEffect(() => {
    void apiGet<HeldSale[]>("/sales/held/").then((res) => setRows(res.ok ? res.data : []));
  }, []);

  return (
    <Dialog open onClose={onClose} labelledBy="held-title" className="w-[520px] gap-[16px]">
      <div className="flex items-center justify-between">
        <span id="held-title" className="text-[16px] font-medium">
          {t("heldTitle")}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("dismiss")}
          className="type-inherit cursor-pointer border-0 bg-transparent p-0 text-[12px] text-text-muted"
        >
          {ESC}
        </button>
      </div>
      {rows?.length === 0 && (
        <div className="p-[24px] text-center text-text-muted">{t("noHeld")}</div>
      )}
      <div className="overflow-hidden rounded-control border border-border">
        {rows?.map((h) => {
          const count = Array.isArray(h.cart) ? h.cart.length : 0;
          const by = pick(ar, { name_ar: h.created_by_name_ar, name_en: h.created_by_name_en });
          const summary = [t("lines", { count }), by].join(SEP);
          return (
            <button
              key={h.id}
              type="button"
              onClick={() => onResume(h)}
              className="type-inherit grid min-h-[52px] w-full cursor-pointer grid-cols-[60px_1fr_110px_90px] items-center gap-[12px] border-0 border-b border-border bg-transparent px-[14px] py-[8px] text-start text-text transition-[background] duration-(--motion-feedback) hover:bg-brand-subtle"
            >
              <span dir="ltr" className="tabular-nums">
                {timeOfDay(h.created_at)}
              </span>
              <span>{summary}</span>
              <span dir="ltr" className="text-end font-semibold tabular-nums">
                {money(h.total ?? "0", ar ? "ar" : "en")}
              </span>
              <span className="text-end font-semibold text-brand">{t("resume")}</span>
            </button>
          );
        })}
      </div>
    </Dialog>
  );
}
