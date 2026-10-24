"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Dialog } from "@/components/ui/Dialog";
import { apiGet } from "@/lib/api/browser";

import { type Customer, pick } from "./types";

const ESC = "Esc";

type Props = {
  current: Customer | null;
  onClose: () => void;
  onChoose: (customer: Customer | null) => void;
};

/** F4: attach a customer to the sale (optional; any payment method). */
export function CustomerDialog({ current, onClose, onChoose }: Props) {
  const t = useTranslations("pos");
  const ar = useLocale() === "ar";
  const input = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [found, setFound] = useState<Customer[]>([]);

  useEffect(() => {
    if (!search.trim()) return;
    let live = true;
    const timer = setTimeout(async () => {
      const res = await apiGet<Customer[]>(`/customers/?q=${encodeURIComponent(search.trim())}`);
      if (live && res.ok) setFound(res.data);
    }, 150);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [search]);

  const shown = search.trim() ? found : [];

  return (
    <Dialog
      open
      onClose={onClose}
      labelledBy="customer-title"
      initialFocus={input}
      className="w-[480px] gap-[12px]"
    >
      <div className="flex items-center justify-between">
        <span id="customer-title" className="type-section">
          {t("customerTitle")}
        </span>
        <span className="text-caption text-text-muted max-[760px]:hidden">{ESC}</span>
      </div>
      <p className="m-0 text-label text-text-muted">{t("customerHint")}</p>
      <input
        ref={input}
        dir="auto"
        aria-label={t("customerSearch")}
        placeholder={t("customerSearch")}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-[44px] w-full rounded-control border-2 border-brand bg-canvas px-[12px] text-lead text-text outline-none"
      />
      {search.trim() && (
        <div className="grid max-h-[220px] overflow-y-auto rounded-control border border-border">
          {shown.length === 0 && (
            <div className="p-[12px] text-center text-text-muted">{t("noCustomers")}</div>
          )}
          {shown.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onChoose(c)}
              className="type-inherit min-h-[44px] cursor-pointer border-0 border-b border-border bg-transparent px-[12px] text-start text-text hover:bg-brand-subtle"
            >
              {pick(ar, c)}
            </button>
          ))}
        </div>
      )}
      {current && (
        <button
          type="button"
          onClick={() => onChoose(null)}
          className="h-[44px] cursor-pointer rounded-control border border-border-strong bg-transparent text-body font-medium text-text"
        >
          {t("customerClear")}
        </button>
      )}
    </Dialog>
  );
}
