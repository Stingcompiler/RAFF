"use client";

import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { Select, TextInput } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";
import {
  NumberCell,
  TableEmpty,
  TableHead,
  TableRow,
  TextCell,
  type Column,
} from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { apiGet, apiSend } from "@/lib/api/browser";
import { money } from "@/lib/format";

import { errorCode, errorKey, type ReturnableSale } from "./types";

const REASONS = ["damaged", "wrong_item", "expired", "not_needed", "other"] as const;
const CONDITIONS = ["sealed", "opened", "damaged"] as const;
type Choice = {
  qty: number;
  reason: (typeof REASONS)[number];
  condition: (typeof CONDITIONS)[number];
};

/** Return from an invoice: lines and quantities (never more than sold), reason, condition. */
export function ReturnForm({ onPosted }: { onPosted: () => void }) {
  const t = useTranslations("returns");
  const tErr = useTranslations("returns.errors");
  const ar = useLocale() === "ar";
  const toast = useToast();
  const [number, setNumber] = useState("");
  const [sale, setSale] = useState<ReturnableSale | null>(null);
  const [missing, setMissing] = useState(false);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [refund, setRefund] = useState<"cash" | "account">("cash");
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ total: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState<string | null>(null);

  const find = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = await apiGet<ReturnableSale>(
      `/returns/lookup/?number=${encodeURIComponent(number.trim())}`,
    );
    setMissing(!res.ok);
    setSale(res.ok ? res.data : null);
    setChoices({});
    setKey(null);
    if (res.ok) setRefund(res.data.default_refund);
  };

  const lines = Object.entries(choices)
    .filter(([, c]) => c.qty > 0)
    .map(([id, c]) => ({
      sale_line_id: id,
      quantity: c.qty,
      reason: c.reason,
      condition: c.condition,
    }));

  const review = async () => {
    if (!sale) return;
    if (lines.length === 0) return setError(t("noLinesChosen"));
    const res = await apiSend<{ total: string }>("POST", "/returns/quote/", {
      sale_id: sale.id,
      lines,
    });
    if (!res.ok) return setError(tErr(errorKey(errorCode(res.error))));
    setError(null);
    setConfirm(res.data);
  };

  const approve = async () => {
    if (!sale) return;
    const k = key ?? crypto.randomUUID();
    setKey(k);
    setBusy(true);
    const res = await apiSend<{ number: string }>(
      "POST",
      "/returns/",
      { sale_id: sale.id, refund_method: refund, lines },
      { idempotencyKey: k },
    );
    setBusy(false);
    setConfirm(null);
    if (!res.ok) {
      if (res.status !== 0) setKey(null);
      return setError(tErr(errorKey(errorCode(res.error))));
    }
    toast.push("success", t("done", { number: res.data.number }));
    setSale(null);
    setNumber("");
    setChoices({});
    setKey(null);
    onPosted();
  };

  const columns: Column[] = [
    { header: t("colItem"), width: "minmax(0,1fr)" },
    { header: t("colSold"), width: "60px", numeric: true },
    { header: t("colReturn"), width: "70px", numeric: true },
    { header: t("colReason"), width: "110px" },
    { header: t("colCondition"), width: "120px" },
  ];
  const set = (id: string, patch: Partial<Choice>) =>
    setChoices((prev) => ({
      ...prev,
      [id]: { qty: 0, reason: "damaged", condition: "sealed", ...prev[id], ...patch },
    }));
  const customer = sale && (ar ? sale.customer_name_ar : sale.customer_name_en);
  const units = lines.reduce((n, l) => n + l.quantity, 0);

  return (
    <Panel
      title={sale ? t("fromInvoice", { number: sale.number }) : t("lookupTitle")}
      note={customer ? t("customer", { name: customer }) : undefined}
    >
      <form onSubmit={find} className="flex items-end gap-[8px] p-[12px]">
        <label className="grid flex-1 gap-[4px] text-caption font-medium text-text-muted">
          {t("invoiceNo")}
          <TextInput
            className="num"
            dir="ltr"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
          />
        </label>
        <Button type="submit" variant="outline" disabled={!number.trim()}>
          {t("find")}
        </Button>
      </form>
      {missing && (
        <div role="alert" className="px-[12px] pb-[12px] text-danger-text">
          {t("notFound")}
        </div>
      )}
      {sale && (
        <>
          <div role="table" aria-label={t("fromInvoice", { number: sale.number })}>
            <TableHead columns={columns} />
            {sale.lines.map((line) => {
              const c = choices[line.id];
              return (
                <TableRow key={line.id} columns={columns}>
                  <TextCell>
                    {ar ? line.name_ar : line.name_en}{" "}
                    <bdi dir="ltr" className="text-caption text-text-muted num">
                      {line.strength}
                    </bdi>
                  </TextCell>
                  <NumberCell>{line.quantity}</NumberCell>
                  <span role="cell">
                    <input
                      dir="ltr"
                      type="number"
                      min={0}
                      max={line.returnable}
                      aria-label={`${t("colReturn")} ${line.name_en}`}
                      title={t("returnable", { count: line.returnable })}
                      disabled={line.returnable === 0}
                      value={c?.qty ?? 0}
                      onChange={(e) =>
                        set(line.id, {
                          qty: Math.max(0, Math.min(line.returnable, Number(e.target.value) || 0)),
                        })
                      }
                      className="h-[32px] w-full rounded-control border border-border-strong bg-surface px-[6px] text-end text-text num"
                    />
                  </span>
                  <span role="cell">
                    <select
                      aria-label={`${t("colReason")} ${line.name_en}`}
                      value={c?.reason ?? "damaged"}
                      onChange={(e) => set(line.id, { reason: e.target.value as Choice["reason"] })}
                      className="h-[32px] w-full rounded-control border border-border-strong bg-surface text-label text-text"
                    >
                      {REASONS.map((r) => (
                        <option key={r} value={r}>
                          {t(`reason.${r}`)}
                        </option>
                      ))}
                    </select>
                  </span>
                  <span role="cell">
                    <select
                      aria-label={`${t("colCondition")} ${line.name_en}`}
                      value={c?.condition ?? "sealed"}
                      onChange={(e) =>
                        set(line.id, { condition: e.target.value as Choice["condition"] })
                      }
                      className="h-[32px] w-full rounded-control border border-border-strong bg-surface text-label text-text"
                    >
                      {CONDITIONS.map((r) => (
                        <option key={r} value={r}>
                          {t(`condition.${r}`)}
                        </option>
                      ))}
                    </select>
                  </span>
                </TableRow>
              );
            })}
            {sale.lines.length === 0 && <TableEmpty>{t("pickInvoice")}</TableEmpty>}
          </div>
          <div className="flex flex-wrap items-end gap-[12px] p-[12px]">
            <label className="grid gap-[4px] type-label text-text-secondary">
              {t("refund")}
              <Select
                value={refund}
                onChange={(e) => setRefund(e.target.value as "cash" | "account")}
              >
                <option value="cash">{t("refundMethod.cash")}</option>
                {customer && <option value="account">{t("refundMethod.account")}</option>}
              </Select>
            </label>
            <div className="ms-auto flex gap-[8px]">
              <Button variant="outline" onClick={() => setSale(null)}>
                {t("cancel")}
              </Button>
              <Button onClick={() => void review()}>{t("submit")}</Button>
            </div>
          </div>
        </>
      )}
      {!sale && !missing && (
        <div className="px-[12px] pb-[12px] text-text-muted">{t("pickInvoice")}</div>
      )}
      {error && (
        <div
          role="alert"
          className="mx-[12px] mb-[12px] rounded-control bg-danger-bg px-[12px] py-[8px] text-danger-text"
        >
          {error}
        </div>
      )}
      <ConfirmDialog
        open={confirm !== null}
        title={t("confirmTitle")}
        body={t("confirmBody")}
        impact={
          confirm
            ? [
                { label: t("refundAmount"), value: money(confirm.total, ar ? "ar" : "en") },
                { label: t("itemsBack"), value: String(units) },
              ]
            : []
        }
        cancelLabel={t("cancel")}
        confirmLabel={t("submit")}
        busyLabel={t("approving")}
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void approve()}
      />
    </Panel>
  );
}
