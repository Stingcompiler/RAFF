"use client";

import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";

import { PageHeader } from "@/components/shell/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TextInput } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";
import { StatTile } from "@/components/ui/StatTile";
import {
  CodeCell,
  NumberCell,
  TableEmpty,
  TableHead,
  TableRow,
  TextCell,
  type Column,
} from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { apiGet, apiSend } from "@/lib/api/browser";
import type { Schemas } from "@/lib/api/types";
import { cleanAmount, isNegative, subtract, toUnits } from "@/lib/decimal";
import { amount, money } from "@/lib/format";

type Summary = Schemas["ShiftSummary"];
type LogRow = Schemas["ShiftLog"];
type Transfer = Schemas["BankTransfer"];
const DASH = "—";

type Props = {
  current: Summary | null;
  log: LogRow[];
  transfers: Transfer[];
  canClose: boolean;
  canFinance: boolean;
};

/** Shifts & cash (Raff Screens › الورديات والخزينة). */
export function ShiftsScreen({
  current,
  log: initialLog,
  transfers: initialTransfers,
  canClose,
  canFinance,
}: Props) {
  const t = useTranslations("shifts");
  const ar = useLocale() === "ar";
  const toast = useToast();
  const cur = (v: string | null | undefined) =>
    money(v ?? "0", ar ? "ar" : "en") || money("0", ar ? "ar" : "en");
  const [summary, setSummary] = useState(current);
  const [log, setLog] = useState(initialLog);
  const [transfers, setTransfers] = useState(initialTransfers);
  const [closing, setClosing] = useState(false);
  const [counted, setCounted] = useState("");
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState<string | null>(null);

  const refresh = async () => {
    const [c, l, b] = await Promise.all([
      apiGet<Summary>("/shifts/current/"),
      apiGet<LogRow[]>("/shifts/history/"),
      apiGet<Transfer[]>("/finance/bank-transfers/"),
    ]);
    if (c.ok) setSummary(c.data);
    if (l.ok) setLog(l.data);
    if (b.ok) setTransfers(b.data);
  };

  const shift = summary?.shift ?? null;
  const variance = counted ? subtract(counted, summary?.expected_cash ?? "0") : null;

  const close = async (e: FormEvent) => {
    e.preventDefault();
    if (!shift || !counted) return;
    const k = key ?? crypto.randomUUID();
    setKey(k);
    setBusy(true);
    const res = await apiSend(
      "POST",
      `/shifts/${shift.id}/close/`,
      { counted_cash: counted },
      { idempotencyKey: k },
    );
    setBusy(false);
    if (!res.ok) {
      if (res.status !== 0) setKey(null);
      return toast.push("danger", t("errors.failed"));
    }
    setClosing(false);
    setCounted("");
    setKey(null);
    toast.push("success", t("closed"));
    void refresh();
  };

  const confirmArrival = async (id: string) => {
    const res = await apiSend("POST", `/finance/bank-transfers/${id}/verify/`);
    if (!res.ok) return toast.push("danger", t("errors.failed"));
    toast.push("success", t("arrived"));
    void refresh();
  };

  const settle = async (id: string) => {
    const res = await apiSend("POST", `/shifts/${id}/settle/`);
    if (!res.ok) return toast.push("danger", t("errors.failed"));
    toast.push("success", t("settledDone"));
    void refresh();
  };

  const transferCols: Column[] = [
    { header: t("colReference"), width: "1fr" },
    { header: t("colAccount"), width: "1fr" },
    { header: t("colAmount"), width: "110px", numeric: true },
    { header: t("colStatus"), width: "150px" },
    { header: "", width: "120px" },
  ];
  const logCols: Column[] = [
    { header: t("colShift"), width: "1fr" },
    { header: t("colVariance"), width: "90px", numeric: true },
    { header: t("colStatus"), width: "110px" },
    { header: "", width: "90px" },
  ];
  return (
    <>
      <PageHeader
        title={t("title")}
        actions={
          canClose && shift && <Button onClick={() => setClosing(true)}>{t("close")}</Button>
        }
      />
      <div className="mb-[16px] grid grid-cols-5 gap-[16px] max-[1180px]:grid-cols-2">
        <StatTile label={t("sales")} value={cur(summary?.sales_total)} />
        <StatTile
          label={t("expected")}
          value={cur(summary?.expected_cash)}
          note={shift ? t("openingNote", { amount: amount(shift.opening_cash) }) : t("noOpen")}
        />
        <StatTile label={t("bank")} value={cur(summary?.bank)} />
        <StatTile label={t("credit")} value={cur(summary?.credit)} />
        <StatTile label={t("expenses")} value={DASH} />
      </div>
      <div className="grid grid-cols-12 items-start gap-[16px]">
        <section className="col-span-7 min-w-0 max-[1180px]:col-span-12">
          <Panel title={t("transfers")}>
            <div role="table" aria-label={t("transfers")}>
              <TableHead columns={transferCols} />
              {transfers.map((tr) => (
                <TableRow key={tr.id} columns={transferCols}>
                  <CodeCell>{tr.bank_reference}</CodeCell>
                  <TextCell>{tr.bank_account || DASH}</TextCell>
                  <NumberCell>{cur(tr.amount)}</NumberCell>
                  <span role="cell">
                    <Badge tone={tr.verification === "pending" ? "info" : "success"} dense>
                      {tr.verification === "pending" ? t("pending") : t("confirmed")}
                    </Badge>
                  </span>
                  <span role="cell">
                    {canFinance && tr.verification === "pending" && (
                      <Button
                        variant="quiet"
                        className="h-[32px] px-[8px]"
                        onClick={() => void confirmArrival(tr.id)}
                      >
                        {t("confirmArrival")}
                      </Button>
                    )}
                  </span>
                </TableRow>
              ))}
              {transfers.length === 0 && <TableEmpty>{t("noTransfers")}</TableEmpty>}
            </div>
          </Panel>
        </section>
        <section className="col-span-5 min-w-0 max-[1180px]:col-span-12">
          <Panel title={t("log")}>
            <div role="table" aria-label={t("log")}>
              <TableHead columns={logCols} />
              {log.map((row) => {
                const s = row.shift;
                if (!s) return null;
                const open = s.status === "open";
                const unsettled =
                  !open && !row.settled && s.variance !== null && toUnits(s.variance ?? "0") !== 0n;
                return (
                  <TableRow key={s.id} columns={logCols}>
                    <TextCell>
                      {t("shiftLine", {
                        number: s.number,
                        counter: ar ? row.device_ar : row.device_en,
                        date: s.opened_at.slice(0, 10),
                      })}
                    </TextCell>
                    <NumberCell>{open ? DASH : amount(s.variance ?? "0") || "0"}</NumberCell>
                    <span role="cell">
                      <Badge tone={open ? "info" : unsettled ? "danger" : "success"} dense>
                        {open ? t("open") : unsettled ? t("unsettled") : t("settled")}
                      </Badge>
                    </span>
                    <span role="cell">
                      {canFinance && unsettled && (
                        <Button
                          variant="quiet"
                          className="h-[32px] px-[8px]"
                          onClick={() => void settle(s.id)}
                        >
                          {t("settle")}
                        </Button>
                      )}
                    </span>
                  </TableRow>
                );
              })}
              {log.length === 0 && <TableEmpty>{t("noShifts")}</TableEmpty>}
            </div>
          </Panel>
        </section>
      </div>
      {shift && (
        <Dialog
          open={closing}
          onClose={busy ? undefined : () => setClosing(false)}
          labelledBy="close-title"
        >
          <form onSubmit={close} className="grid gap-[14px]">
            <div id="close-title" className="text-[16px] font-medium">
              {t("closeTitle", { number: shift.number })}
            </div>
            <div className="text-text-muted">{t("closeBody")}</div>
            <label className="grid gap-[4px] text-[12px] font-medium text-text-muted">
              {t("counted")}
              <TextInput
                dir="ltr"
                inputMode="decimal"
                value={counted}
                onChange={(e) => setCounted(cleanAmount(e.target.value))}
              />
            </label>
            <div className="grid gap-[6px] rounded-[8px] bg-warning-bg p-[12px] font-medium text-warning-text">
              <div className="flex justify-between gap-[12px]">
                <span>
                  {variance && isNegative(variance)
                    ? t("shortage")
                    : variance && toUnits(variance) > 0n
                      ? t("overage")
                      : t("even")}
                </span>
                <span dir="ltr" className="tabular-nums">
                  {variance ? cur(variance) : DASH}
                </span>
              </div>
              <div className="flex justify-between gap-[12px]">
                <span>{t("expected")}</span>
                <span dir="ltr" className="tabular-nums">
                  {cur(summary?.expected_cash)}
                </span>
              </div>
            </div>
            <div className="flex justify-end gap-[8px]">
              <Button variant="outline" size="lg" onClick={() => setClosing(false)} disabled={busy}>
                {t("back")}
              </Button>
              <Button type="submit" size="lg" disabled={busy || !counted}>
                {busy ? t("closing") : t("close")}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
