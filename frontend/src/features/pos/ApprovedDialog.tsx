"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";

import { Dialog } from "@/components/ui/Dialog";
import { ReceiptPreview } from "@/components/ui/ReceiptPreview";
import { useToast } from "@/components/ui/Toast";
import { apiSend } from "@/lib/api/browser";
import { money } from "@/lib/format";

import { type Receipt, requestRef, type SaleResult } from "./types";

const ENTER = "Enter";
const SEP = " · ";

type Props = {
  sale: SaleResult;
  receipt: Receipt;
  requestKey: string;
  onNewSale: () => void;
};

/** Sale approved: receipt preview, print / reprint (80mm via the browser), new sale on Enter. */
export function ApprovedDialog({ sale, receipt, requestKey, onNewSale }: Props) {
  const t = useTranslations("pos");
  const ar = useLocale() === "ar";
  const toast = useToast();
  const [printing, setPrinting] = useState<Receipt | null>(null);
  const newSale = useRef<HTMLButtonElement>(null);

  const print = async (reprint: boolean) => {
    const res = await apiSend<Receipt>(
      "POST",
      `/sales/${sale.id}/print/${reprint ? "?reprint=1" : ""}`,
    );
    if (res.ok) {
      // Render the receipt into <body>, print it, then remove it.
      flushSync(() => setPrinting(res.data));
      window.print();
      setPrinting(null);
    } else toast.push("danger", t("printFailed"));
  };

  const reference = [sale.number, requestRef(requestKey)].join(SEP);
  return (
    <Dialog
      open
      onClose={onNewSale}
      labelledBy="approved-title"
      initialFocus={newSale}
      className="grid max-h-[80vh] w-[680px] grid-cols-[302px_1fr] grid-rows-[minmax(0,1fr)_auto] gap-x-[24px] gap-y-[16px] overflow-hidden max-[760px]:max-h-[calc(100dvh-24px)] max-[760px]:grid-cols-1 max-[760px]:grid-rows-[auto_minmax(0,1fr)_auto] max-[760px]:overflow-hidden"
    >
      <div className="row-span-2 min-h-0 overflow-y-auto max-[760px]:order-2 max-[760px]:row-span-1">
        <ReceiptPreview
          data={receipt}
          className="box-border animate-[raff-fade_var(--motion-scene)_ease_both]"
        />
      </div>
      <div className="grid content-start gap-[12px] max-[760px]:order-1">
        <div
          id="approved-title"
          role="status"
          className="flex items-center gap-[8px] rounded-control bg-success-bg px-[12px] py-[10px] font-semibold text-success-text"
        >
          {t("approvedMsg")}
        </div>
        <div dir="ltr" className="text-start text-[12px] text-text-muted">
          {reference}
        </div>
        <div className="flex justify-between font-semibold">
          <span>{t("total")}</span>
          <span dir="ltr" className="whitespace-nowrap" data-testid="approved-total">
            {money(sale.total, ar ? "ar" : "en")}
          </span>
        </div>
        {sale.change !== "0" && !/^0(\.0+)?$/.test(sale.change) && (
          <div className="flex justify-between font-semibold text-success-text">
            <span>{t("change")}</span>
            <span dir="ltr" className="whitespace-nowrap" data-testid="approved-change">
              {money(sale.change, ar ? "ar" : "en")}
            </span>
          </div>
        )}
      </div>
      <div className="col-start-2 grid gap-[8px] self-end max-[760px]:order-3 max-[760px]:col-start-1">
        <button
          type="button"
          onClick={() => void print(false)}
          className="h-[44px] cursor-pointer rounded-control border border-border-strong bg-transparent font-medium text-text"
        >
          {t("print")}
        </button>
        <button
          type="button"
          onClick={() => void print(true)}
          className="h-[44px] cursor-pointer rounded-control border border-border-strong bg-transparent font-medium text-text"
        >
          {t("reprint")}
        </button>
        <button
          type="button"
          ref={newSale}
          onClick={onNewSale}
          className="h-[52px] cursor-pointer rounded-control border-0 bg-brand text-[16px] font-semibold text-on-brand"
        >
          {t("newSale")}{" "}
          <span dir="ltr" className="text-[13px] opacity-85">
            {ENTER}
          </span>
        </button>
      </div>
      {printing &&
        createPortal(
          <div className="raff-print hidden print:block">
            <ReceiptPreview data={printing} />
          </div>,
          document.body,
        )}
    </Dialog>
  );
}
